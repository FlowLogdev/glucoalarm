import { classifyTier, isStale, type Person, type Tier } from "./lib/alerts";
import { bearerToken, getSessionAdmin, login, logout, type Admin } from "./auth";
import { getReport, REPORT_PERIODS, type ReportPeriod } from "./reports";
import { getA1CEstimates } from "./a1c";
import { postSetupAssistant } from "./setup-assistant";
import { getStatus, restartService } from "./status";
import { postDoctorInvite, getDoctors, deleteDoctor } from "./doctors";
import { getReportCsv } from "./csv";
import { generateInsight, getCachedInsight } from "./insights";
import { postSignupCheckout, postSignupComplete, postSignupCompleteGoogle, postPeople } from "./signup";
import { getBilling, postBillingPortal } from "./billing";
import { getTickets, getTicket, postTicket, postTicketReply, patchTicketStatus, postPublicTicket } from "./support";
import { getA1CRecords, postA1CRecord, deleteA1CRecord } from "./a1c-records";
import { generateReport, determineDuePeriods, MAX_CUSTOM_RANGE_DAYS, type ReportPerson } from "./reports-generator";
import type { Env } from "./types";

const TICKER_INTERVAL_OPTIONS = new Set([5, 8, 10, 15, 20, 30, 60]);
const MAX_SUBSCRIBERS_FOR_NEW_CUSTOMERS = 2;
const FELIPE_INTERNAL_CUSTOMER_ID = "felipe-internal";

/** Super-admins (support@flowlog.dev, andreapastori2012@gmail.com) see everything; everyone else is scoped to their own customer_id. */
async function assertOwnsPerson(env: Env, admin: Admin, personId: string): Promise<boolean> {
  if (admin.is_super_admin) return true;
  const person = await env.DB.prepare(`SELECT customer_id FROM people WHERE id = ?`).bind(personId).first<{ customer_id: string | null }>();
  return !!person && person.customer_id === admin.customer_id;
}

/** Same ownership check, but by phone_subscribers row id (looks up the owning person first). */
async function assertOwnsSubscriber(env: Env, admin: Admin, subscriberId: string): Promise<boolean> {
  if (admin.is_super_admin) return true;
  const row = await env.DB
    .prepare(`SELECT people.customer_id as customer_id FROM phone_subscribers JOIN people ON people.id = phone_subscribers.person_id WHERE phone_subscribers.id = ?`)
    .bind(subscriberId)
    .first<{ customer_id: string | null }>();
  return !!row && row.customer_id === admin.customer_id;
}

/** Doctors are read-only: invited by a customer to view data, never to change it. */
function requireWriteAccess(admin: Admin): Response | null {
  if (admin.role === "doctor") return jsonResponse({ error: "forbidden", detail: "Doctor accounts are read-only." }, 403);
  return null;
}

/** Same ownership check, but by insulin_log row id. */
async function assertOwnsInsulinLogEntry(env: Env, admin: Admin, entryId: string): Promise<boolean> {
  if (admin.is_super_admin) return true;
  const row = await env.DB
    .prepare(`SELECT people.customer_id as customer_id FROM insulin_log JOIN people ON people.id = insulin_log.person_id WHERE insulin_log.id = ?`)
    .bind(entryId)
    .first<{ customer_id: string | null }>();
  return !!row && row.customer_id === admin.customer_id;
}

type Status = Tier | "stale" | "no_data";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function corsHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers });
}

function computeStatus(
  person: Person,
  reading: { value_mgdl: number; received_at: number } | null,
  now: number
): Status {
  if (!reading) return "no_data";
  if (isStale(now, reading.received_at, person.stale_minutes)) return "stale";
  return classifyTier(person, reading.value_mgdl);
}

const PERSON_COLUMNS = `id, name, safe_low, safe_high, critical_low, critical_high, stale_minutes, carb_ratio, correction_factor, target_glucose, timezone, ticker_interval_minutes, report_email_address, report_email_weekly, report_email_monthly`;

interface PersonWithDosing extends Person {
  carb_ratio: number | null;
  correction_factor: number | null;
  target_glucose: number | null;
  timezone: string | null;
  ticker_interval_minutes: number;
  report_email_address: string | null;
  report_email_weekly: number;
  report_email_monthly: number;
}

async function postLogin(env: Env, request: Request, now: number): Promise<Response> {
  const body = await request.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return jsonResponse({ error: "email and password are required" }, 400);
  }
  const result = await login(env, body.email, body.password, now);
  if (!result) return jsonResponse({ error: "invalid_credentials" }, 401);
  return jsonResponse(result);
}

async function postLogout(env: Env, request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (token) await logout(env, token);
  return jsonResponse({ ok: true });
}

async function getPeople(env: Env, admin: Admin): Promise<Response> {
  const people = admin.is_super_admin
    ? await env.DB.prepare(`SELECT ${PERSON_COLUMNS} FROM people`).all<PersonWithDosing>()
    : await env.DB.prepare(`SELECT ${PERSON_COLUMNS} FROM people WHERE customer_id = ?`).bind(admin.customer_id).all<PersonWithDosing>();
  return jsonResponse(people.results);
}

async function getLatest(env: Env, personId: string, now: number): Promise<Response> {
  const person = await env.DB
    .prepare(`SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`)
    .bind(personId)
    .first<PersonWithDosing>();
  if (!person) return jsonResponse({ error: "person_not_found" }, 404);

  const reading = await env.DB
    .prepare(
      `SELECT value_mgdl, trend, recorded_at, received_at FROM readings WHERE person_id = ? ORDER BY recorded_at DESC LIMIT 1`
    )
    .bind(personId)
    .first<{ value_mgdl: number; trend: string; recorded_at: number; received_at: number }>();

  return jsonResponse({
    person,
    reading: reading ?? null,
    status: computeStatus(person, reading, now),
    now,
  });
}

async function getHistory(env: Env, personId: string, hours: number): Promise<Response> {
  const since = Math.floor(Date.now() / 1000) - Math.round(hours * 3600);
  const readings = await env.DB
    .prepare(
      `SELECT value_mgdl, trend, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`
    )
    .bind(personId, since)
    .all<{ value_mgdl: number; trend: string; recorded_at: number }>();
  return jsonResponse(readings.results);
}

async function getReportRoute(env: Env, personId: string, periodParam: string | null, now: number): Promise<Response> {
  const periodKey = (periodParam && periodParam in REPORT_PERIODS ? periodParam : "week") as ReportPeriod;
  const report = await getReport(env, personId, periodKey, now);
  if (!report) return jsonResponse({ error: "person_not_found" }, 404);
  return jsonResponse(report);
}

async function getSubscribers(env: Env, personId: string): Promise<Response> {
  const subs = await env.DB
    .prepare(
      `SELECT id, person_id, phone_number, label, call_on_low, call_priority, active_start_minute, active_end_minute, active_days FROM phone_subscribers WHERE person_id = ? ORDER BY call_priority ASC`
    )
    .bind(personId)
    .all();
  return jsonResponse(subs.results);
}

async function postThresholds(env: Env, request: Request, admin: Admin): Promise<Response> {
  const body = await request.json<{
    person_id?: string;
    safe_low?: number;
    safe_high?: number;
    critical_low?: number;
    critical_high?: number;
    stale_minutes?: number;
  }>();
  const { person_id, safe_low, safe_high, critical_low, critical_high, stale_minutes } = body;
  if (
    !person_id ||
    safe_low == null ||
    safe_high == null ||
    critical_low == null ||
    critical_high == null ||
    stale_minutes == null
  ) {
    return jsonResponse(
      { error: "person_id, safe_low, safe_high, critical_low, critical_high, and stale_minutes are required" },
      400
    );
  }
  if (!(await assertOwnsPerson(env, admin, person_id))) return jsonResponse({ error: "person_not_found" }, 404);
  if (critical_low >= safe_low || safe_low >= safe_high || safe_high >= critical_high) {
    return jsonResponse(
      { error: "thresholds must satisfy critical_low < safe_low < safe_high < critical_high" },
      400
    );
  }
  const result = await env.DB
    .prepare(
      `UPDATE people SET safe_low = ?, safe_high = ?, critical_low = ?, critical_high = ?, stale_minutes = ? WHERE id = ?`
    )
    .bind(safe_low, safe_high, critical_low, critical_high, stale_minutes, person_id)
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "person_not_found" }, 404);
  return jsonResponse({ ok: true });
}

async function postDosingSettings(env: Env, request: Request, admin: Admin): Promise<Response> {
  const body = await request.json<{
    person_id?: string;
    carb_ratio?: number | null;
    correction_factor?: number | null;
    target_glucose?: number | null;
  }>();
  if (!body.person_id) {
    return jsonResponse({ error: "person_id is required" }, 400);
  }
  if (!(await assertOwnsPerson(env, admin, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);
  const carbRatio = body.carb_ratio ?? null;
  const correctionFactor = body.correction_factor ?? null;
  const targetGlucose = body.target_glucose ?? null;
  if (
    (carbRatio != null && carbRatio <= 0) ||
    (correctionFactor != null && correctionFactor <= 0) ||
    (targetGlucose != null && targetGlucose <= 0)
  ) {
    return jsonResponse({ error: "carb_ratio, correction_factor, and target_glucose must be positive" }, 400);
  }
  const result = await env.DB
    .prepare(`UPDATE people SET carb_ratio = ?, correction_factor = ?, target_glucose = ? WHERE id = ?`)
    .bind(carbRatio, correctionFactor, targetGlucose, body.person_id)
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "person_not_found" }, 404);
  return jsonResponse({ ok: true });
}

async function postTimezone(env: Env, request: Request, admin: Admin): Promise<Response> {
  const body = await request.json<{ person_id?: string; timezone?: string | null }>();
  if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
  if (!(await assertOwnsPerson(env, admin, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);

  const timezone = body.timezone || null;
  if (timezone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return jsonResponse({ error: "invalid IANA timezone name" }, 400);
    }
  }

  const result = await env.DB
    .prepare(`UPDATE people SET timezone = ? WHERE id = ?`)
    .bind(timezone, body.person_id)
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "person_not_found" }, 404);
  return jsonResponse({ ok: true });
}

async function postTickerInterval(env: Env, request: Request, admin: Admin): Promise<Response> {
  const body = await request.json<{ person_id?: string; ticker_interval_minutes?: number }>();
  if (!body.person_id || body.ticker_interval_minutes == null) {
    return jsonResponse({ error: "person_id and ticker_interval_minutes are required" }, 400);
  }
  if (!TICKER_INTERVAL_OPTIONS.has(body.ticker_interval_minutes)) {
    return jsonResponse({ error: "ticker_interval_minutes must be one of 5, 10, 15, 20, 30, 60" }, 400);
  }
  if (!(await assertOwnsPerson(env, admin, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);

  const result = await env.DB
    .prepare(`UPDATE people SET ticker_interval_minutes = ? WHERE id = ?`)
    .bind(body.ticker_interval_minutes, body.person_id)
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "person_not_found" }, 404);
  return jsonResponse({ ok: true });
}

async function getInsightRoute(env: Env, personId: string, periodParam: string | null): Promise<Response> {
  const periodKey = (periodParam && periodParam in REPORT_PERIODS ? periodParam : "week") as ReportPeriod;
  const insight = await getCachedInsight(env, personId, periodKey);
  return jsonResponse(insight);
}

async function postGenerateInsight(env: Env, request: Request, admin: Admin, now: number): Promise<Response> {
  const body = await request.json<{ person_id?: string; period?: string }>();
  if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
  if (!(await assertOwnsPerson(env, admin, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);
  const periodKey = (body.period && body.period in REPORT_PERIODS ? body.period : "week") as ReportPeriod;

  const person = await env.DB
    .prepare(`SELECT id, name, safe_low, safe_high, critical_low, critical_high, timezone FROM people WHERE id = ?`)
    .bind(body.person_id)
    .first<{
      id: string;
      name: string;
      safe_low: number;
      safe_high: number;
      critical_low: number;
      critical_high: number;
      timezone: string | null;
    }>();
  if (!person) return jsonResponse({ error: "person_not_found" }, 404);

  try {
    const insight = await generateInsight(env, person, periodKey, now);
    return jsonResponse(insight);
  } catch (err) {
    console.error("generateInsight failed:", err);
    return jsonResponse({ error: "insight_generation_failed" }, 502);
  }
}

async function getInsulinLog(env: Env, personId: string, hours: number): Promise<Response> {
  const since = Math.floor(Date.now() / 1000) - Math.round(hours * 3600);
  const entries = await env.DB
    .prepare(
      `SELECT id, person_id, logged_at, carbs_grams, food_description, glucose_at_dose, dose_units, note
       FROM insulin_log WHERE person_id = ? AND logged_at >= ? ORDER BY logged_at DESC`
    )
    .bind(personId, since)
    .all();
  return jsonResponse(entries.results);
}

async function postInsulinLog(env: Env, request: Request, admin: Admin, now: number): Promise<Response> {
  const body = await request.json<{
    person_id?: string;
    logged_at?: number;
    carbs_grams?: number | null;
    food_description?: string | null;
    glucose_at_dose?: number | null;
    dose_units?: number | null;
    note?: string | null;
  }>();
  if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
  if (body.carbs_grams == null && body.dose_units == null) {
    return jsonResponse({ error: "at least one of carbs_grams or dose_units is required" }, 400);
  }
  if ((body.carbs_grams != null && body.carbs_grams < 0) || (body.dose_units != null && body.dose_units < 0)) {
    return jsonResponse({ error: "carbs_grams and dose_units must not be negative" }, 400);
  }
  if (!(await assertOwnsPerson(env, admin, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);

  const result = await env.DB
    .prepare(
      `INSERT INTO insulin_log (person_id, logged_at, carbs_grams, food_description, glucose_at_dose, dose_units, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      body.person_id,
      body.logged_at ?? now,
      body.carbs_grams ?? null,
      body.food_description ?? null,
      body.glucose_at_dose ?? null,
      body.dose_units ?? null,
      body.note ?? null
    )
    .run();
  return jsonResponse({ id: result.meta.last_row_id }, 201);
}

async function deleteInsulinLog(env: Env, id: string): Promise<Response> {
  if (!/^\d+$/.test(id)) return jsonResponse({ error: "invalid id" }, 400);
  const result = await env.DB.prepare(`DELETE FROM insulin_log WHERE id = ?`).bind(id).run();
  if (result.meta.changes === 0) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({ ok: true });
}

const E164 = /^\+[1-9]\d{6,14}$/;
const ACTIVE_DAYS_RE = /^[0-6](,[0-6]){0,6}$/;

/** Both minute fields null = always active. active_days null = every day. */
function validateSchedule(body: {
  active_start_minute?: number | null;
  active_end_minute?: number | null;
  active_days?: string | null;
}): { error: string } | { active_start_minute: number | null; active_end_minute: number | null; active_days: string | null } {
  const start = body.active_start_minute ?? null;
  const end = body.active_end_minute ?? null;
  const days = body.active_days?.trim() || null;

  if ((start === null) !== (end === null)) {
    return { error: "active_start_minute and active_end_minute must be set together or both left blank" };
  }
  if (start !== null && (!Number.isInteger(start) || start < 0 || start > 1439)) {
    return { error: "active_start_minute must be an integer 0-1439" };
  }
  if (end !== null && (!Number.isInteger(end) || end < 0 || end > 1439)) {
    return { error: "active_end_minute must be an integer 0-1439" };
  }
  if (days !== null && !ACTIVE_DAYS_RE.test(days)) {
    return { error: "active_days must be comma-separated digits 0-6 (Sun-Sat)" };
  }
  return { active_start_minute: start, active_end_minute: end, active_days: days };
}

async function postSubscriber(env: Env, request: Request, admin: Admin): Promise<Response> {
  const body = await request.json<{
    person_id?: string;
    phone_number?: string;
    label?: string;
    call_on_low?: boolean;
    call_priority?: number;
    active_start_minute?: number | null;
    active_end_minute?: number | null;
    active_days?: string | null;
  }>();
  if (!body.person_id || !body.phone_number) {
    return jsonResponse({ error: "person_id and phone_number are required" }, 400);
  }
  if (!E164.test(body.phone_number)) {
    return jsonResponse({ error: "phone_number must be E.164 format, e.g. +13055551234" }, 400);
  }
  const schedule = validateSchedule(body);
  if ("error" in schedule) return jsonResponse({ error: schedule.error }, 400);
  const person = await env.DB
    .prepare(`SELECT id, customer_id FROM people WHERE id = ?`)
    .bind(body.person_id)
    .first<{ id: string; customer_id: string | null }>();
  if (!person) return jsonResponse({ error: "person_not_found" }, 404);
  if (!admin.is_super_admin && person.customer_id !== admin.customer_id) {
    return jsonResponse({ error: "person_not_found" }, 404);
  }

  if (person.customer_id !== FELIPE_INTERNAL_CUSTOMER_ID) {
    const count = await env.DB
      .prepare(`SELECT COUNT(*) as n FROM phone_subscribers WHERE person_id = ?`)
      .bind(body.person_id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_SUBSCRIBERS_FOR_NEW_CUSTOMERS) {
      return jsonResponse({ error: `a maximum of ${MAX_SUBSCRIBERS_FOR_NEW_CUSTOMERS} alert phone numbers is allowed` }, 400);
    }
  }

  const result = await env.DB
    .prepare(
      `INSERT INTO phone_subscribers (person_id, phone_number, label, call_on_low, call_priority, active_start_minute, active_end_minute, active_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      body.person_id,
      body.phone_number,
      body.label ?? null,
      body.call_on_low ? 1 : 0,
      body.call_priority ?? 0,
      schedule.active_start_minute,
      schedule.active_end_minute,
      schedule.active_days
    )
    .run();
  return jsonResponse({ id: result.meta.last_row_id }, 201);
}

async function patchSubscriber(env: Env, id: string, request: Request): Promise<Response> {
  if (!/^\d+$/.test(id)) return jsonResponse({ error: "invalid id" }, 400);
  const body = await request.json<{
    call_on_low?: boolean;
    call_priority?: number;
    active_start_minute?: number | null;
    active_end_minute?: number | null;
    active_days?: string | null;
  }>();
  const hasScheduleField = "active_start_minute" in body || "active_end_minute" in body || "active_days" in body;
  if (body.call_on_low == null && body.call_priority == null && !hasScheduleField) {
    return jsonResponse({ error: "call_on_low, call_priority, or a schedule field is required" }, 400);
  }

  const current = await env.DB
    .prepare(`SELECT call_on_low, call_priority, active_start_minute, active_end_minute, active_days FROM phone_subscribers WHERE id = ?`)
    .bind(id)
    .first<{ call_on_low: number; call_priority: number; active_start_minute: number | null; active_end_minute: number | null; active_days: string | null }>();
  if (!current) return jsonResponse({ error: "not_found" }, 404);

  const schedule = hasScheduleField
    ? validateSchedule(body)
    : { active_start_minute: current.active_start_minute, active_end_minute: current.active_end_minute, active_days: current.active_days };
  if ("error" in schedule) return jsonResponse({ error: schedule.error }, 400);

  const result = await env.DB
    .prepare(`UPDATE phone_subscribers SET call_on_low = ?, call_priority = ?, active_start_minute = ?, active_end_minute = ?, active_days = ? WHERE id = ?`)
    .bind(
      body.call_on_low != null ? (body.call_on_low ? 1 : 0) : current.call_on_low,
      body.call_priority ?? current.call_priority,
      schedule.active_start_minute,
      schedule.active_end_minute,
      schedule.active_days,
      id
    )
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({ ok: true });
}

async function deleteSubscriber(env: Env, id: string): Promise<Response> {
  if (!/^\d+$/.test(id)) return jsonResponse({ error: "invalid id" }, 400);
  const result = await env.DB.prepare(`DELETE FROM phone_subscribers WHERE id = ?`).bind(id).run();
  if (result.meta.changes === 0) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({ ok: true });
}

const PUBLIC_ROUTES = new Set([
  "POST /api/auth/login",
  "POST /api/signup/checkout",
  "POST /api/signup/complete",
  "POST /api/signup/complete-google",
  "POST /api/support/public-tickets",
]);

export async function handleApi(request: Request, env: Env, now: number): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    return corsHeaders(new Response(null, { status: 204 }));
  }

  let response: Response;
  try {
    const routeKey = `${request.method} ${url.pathname}`;
    let admin: Admin | null = null;
    if (!PUBLIC_ROUTES.has(routeKey) && url.pathname !== "/api/auth/logout") {
      const token = bearerToken(request);
      admin = token ? await getSessionAdmin(env, token, now) : null;
      if (!admin) {
        response = jsonResponse({ error: "unauthorized" }, 401);
        return corsHeaders(response);
      }
    }
    response = await route(request, url, env, now, admin);
  } catch (err) {
    console.error("API error:", err);
    response = jsonResponse({ error: "internal_error" }, 500);
  }
  return corsHeaders(response);
}

async function route(request: Request, url: URL, env: Env, now: number, admin: Admin | null): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  if (method === "POST" && path === "/api/auth/login") {
    return postLogin(env, request, now);
  }

  if (method === "POST" && path === "/api/auth/logout") {
    return postLogout(env, request);
  }

  if (method === "POST" && path === "/api/signup/checkout") {
    return postSignupCheckout(env);
  }

  if (method === "POST" && path === "/api/signup/complete") {
    return postSignupComplete(env, request, now);
  }

  if (method === "POST" && path === "/api/signup/complete-google") {
    return postSignupCompleteGoogle(env, request, now);
  }

  if (method === "POST" && path === "/api/support/public-tickets") {
    return postPublicTicket(env, request, now);
  }

  // Every route below requires a session (enforced in handleApi), so `admin` is non-null here.
  const a = admin as Admin;

  if (method === "GET" && path === "/api/people") {
    return getPeople(env, a);
  }

  if (method === "POST" && path === "/api/people") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postPeople(env, request, a, now);
  }

  if (method === "GET" && path === "/api/readings/latest") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return getLatest(env, personId, now);
  }

  if (method === "GET" && path === "/api/readings/history") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const hours = Number(url.searchParams.get("hours") ?? "24");
    return getHistory(env, personId, Number.isFinite(hours) && hours > 0 ? hours : 24);
  }

  if (method === "GET" && path === "/api/reports") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return getReportRoute(env, personId, url.searchParams.get("period"), now);
  }

  if (method === "GET" && path === "/api/reports/csv") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const periodParam = url.searchParams.get("period");
    const periodKey = (periodParam && periodParam in REPORT_PERIODS ? periodParam : "week") as ReportPeriod;
    const csv = await getReportCsv(env, personId, periodKey, now);
    if (!csv) return jsonResponse({ error: "person_not_found" }, 404);
    return csv;
  }

  if (method === "GET" && path === "/api/me") {
    return jsonResponse({ email: a.email, role: a.role, is_super_admin: !!a.is_super_admin });
  }

  if (method === "POST" && path === "/api/setup-assistant") {
    return postSetupAssistant(env, request);
  }

  if (method === "GET" && path === "/api/status") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const status = await getStatus(env, personId, now);
    if (!status) return jsonResponse({ error: "person_not_found" }, 404);
    return jsonResponse(status);
  }

  if (method === "POST" && path === "/api/restart-service") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    const body = await request.json<{ person_id?: string }>();
    if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);
    const status = await restartService(env, body.person_id, now);
    if (!status) return jsonResponse({ error: "person_not_found" }, 404);
    return jsonResponse(status);
  }

  if (method === "GET" && path === "/api/a1c") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const estimates = await getA1CEstimates(env, personId, now);
    if (!estimates) return jsonResponse({ error: "person_not_found" }, 404);
    return jsonResponse(estimates);
  }

  if (method === "GET" && path === "/api/a1c-records") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return getA1CRecords(env, personId);
  }

  if (method === "POST" && path === "/api/a1c-records") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    const body = await request.json<{ person_id?: string; a1c_value?: number; measured_at?: number; source?: string; notes?: string }>();
    if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);
    return postA1CRecord(env, body.person_id, body, now);
  }

  const a1cRecordDeleteMatch = /^\/api\/a1c-records\/(\w+)$/.exec(path);
  if (method === "DELETE" && a1cRecordDeleteMatch) {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return deleteA1CRecord(env, personId, a1cRecordDeleteMatch[1]);
  }

  if (method === "GET" && path === "/api/glucose-reports") {
    const personId = url.searchParams.get("person_id");
    const reportType = url.searchParams.get("type");
    if (!personId || (reportType !== "weekly" && reportType !== "monthly" && reportType !== "custom")) {
      return jsonResponse({ error: "person_id and type ('weekly', 'monthly', or 'custom') are required" }, 400);
    }
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit") ?? "1")));
    const rows = await env.DB
      .prepare(
        `SELECT id, period_start, period_end, metrics, patterns, ai_analysis, data_coverage, status, generated_at
         FROM glucose_reports WHERE person_id = ? AND report_type = ? ORDER BY period_end DESC LIMIT ?`
      )
      .bind(personId, reportType, limit)
      .all<{
        id: number;
        period_start: number;
        period_end: number;
        metrics: string;
        patterns: string | null;
        ai_analysis: string | null;
        data_coverage: string;
        status: string;
        generated_at: number;
      }>();
    const parsed = rows.results.map((r) => ({
      id: r.id,
      period_start: r.period_start,
      period_end: r.period_end,
      metrics: JSON.parse(r.metrics),
      patterns: r.patterns ? JSON.parse(r.patterns) : null,
      ai_analysis: r.ai_analysis ? JSON.parse(r.ai_analysis) : null,
      data_coverage: JSON.parse(r.data_coverage),
      status: r.status,
      generated_at: r.generated_at,
    }));
    return jsonResponse(limit === 1 ? parsed[0] ?? null : parsed);
  }

  // Manual trigger for testing/support -- same operator-only spirit as
  // /__poll, restricted to super-admins rather than any account owner
  // since it can generate real reports (and a real WhatsApp notification)
  // outside the normal daily schedule.
  if (method === "POST" && path === "/api/reports/generate-now") {
    if (!a.is_super_admin) return jsonResponse({ error: "forbidden" }, 403);
    const body = await request.json<{
      person_id?: string;
      report_type?: "weekly" | "monthly";
      period_start?: number;
      period_end?: number;
    }>();
    if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
    const person = await env.DB
      .prepare(`SELECT id, name, timezone, safe_low, safe_high, critical_low, critical_high FROM people WHERE id = ?`)
      .bind(body.person_id)
      .first<ReportPerson>();
    if (!person) return jsonResponse({ error: "person_not_found" }, 404);
    const timezone = person.timezone ?? "UTC";

    // Explicit period override lets this be used to test/backfill any
    // period on demand; without it, only whatever's actually due today
    // (matching the real cron's behavior) is generated.
    if (body.report_type && body.period_start != null && body.period_end != null) {
      const outcome = await generateReport(env, person, body.report_type, body.period_start, body.period_end, now);
      return jsonResponse({ results: [{ reportType: body.report_type, periodStart: body.period_start, periodEnd: body.period_end, ...outcome }] });
    }

    const due = determineDuePeriods(now, timezone);
    if (due.length === 0) {
      return jsonResponse({ error: "no_period_due_today", detail: "Today is not a week/month boundary in this person's timezone." }, 400);
    }
    const results = [];
    for (const period of due) {
      const outcome = await generateReport(env, person, period.reportType, period.periodStart, period.periodEnd, now);
      results.push({ ...period, ...outcome });
    }
    return jsonResponse({ results });
  }

  // Customer-facing on-demand report for any date range up to 12 months.
  // report_type is always 'custom' here -- kept separate from the
  // automatically-scheduled weekly/monthly rows so they never collide or
  // get mixed into the "latest weekly/monthly" queries. No notification
  // (WhatsApp/email) fires for these -- the customer is watching it
  // generate, a "report ready" ping adds nothing.
  if (method === "POST" && path === "/api/reports/custom") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    const body = await request.json<{ person_id?: string; period_start?: number; period_end?: number }>();
    if (!body.person_id || body.period_start == null || body.period_end == null) {
      return jsonResponse({ error: "person_id, period_start, and period_end are required" }, 400);
    }
    if (!(await assertOwnsPerson(env, a, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);
    if (body.period_end <= body.period_start) {
      return jsonResponse({ error: "period_end must be after period_start" }, 400);
    }
    if (body.period_end > now) {
      return jsonResponse({ error: "period_end cannot be in the future" }, 400);
    }
    const rangeDays = (body.period_end - body.period_start) / 86400;
    if (rangeDays > MAX_CUSTOM_RANGE_DAYS) {
      return jsonResponse({ error: `range cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days (about 12 months)` }, 400);
    }
    const person = await env.DB
      .prepare(
        `SELECT id, name, timezone, safe_low, safe_high, critical_low, critical_high FROM people WHERE id = ?`
      )
      .bind(body.person_id)
      .first<ReportPerson>();
    if (!person) return jsonResponse({ error: "person_not_found" }, 404);

    const outcome = await generateReport(env, person, "custom", body.period_start, body.period_end, now, false);
    return jsonResponse({ periodStart: body.period_start, periodEnd: body.period_end, ...outcome });
  }

  if (method === "POST" && path === "/api/settings/report-email") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    const body = await request.json<{ person_id?: string; email?: string | null; weekly?: boolean; monthly?: boolean }>();
    if (!body.person_id) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, body.person_id))) return jsonResponse({ error: "person_not_found" }, 404);
    if ((body.weekly || body.monthly) && !body.email) {
      return jsonResponse({ error: "an email address is required to enable report email delivery" }, 400);
    }
    await env.DB
      .prepare(`UPDATE people SET report_email_address = ?, report_email_weekly = ?, report_email_monthly = ? WHERE id = ?`)
      .bind(body.email || null, body.weekly ? 1 : 0, body.monthly ? 1 : 0, body.person_id)
      .run();
    return jsonResponse({ ok: true });
  }

  if (method === "GET" && path === "/api/subscribers") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return getSubscribers(env, personId);
  }

  if (method === "POST" && path === "/api/settings/thresholds") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postThresholds(env, request, a);
  }

  if (method === "POST" && path === "/api/settings/dosing") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postDosingSettings(env, request, a);
  }

  if (method === "POST" && path === "/api/settings/timezone") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postTimezone(env, request, a);
  }

  if (method === "POST" && path === "/api/settings/ticker-interval") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postTickerInterval(env, request, a);
  }

  if (method === "GET" && path === "/api/insights") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return getInsightRoute(env, personId, url.searchParams.get("period"));
  }

  if (method === "POST" && path === "/api/insights/generate") {
    return postGenerateInsight(env, request, a, now);
  }

  if (method === "POST" && path === "/api/subscribers") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postSubscriber(env, request, a);
  }

  const subscriberDeleteMatch = /^\/api\/subscribers\/(\w+)$/.exec(path);
  if (method === "DELETE" && subscriberDeleteMatch) {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    if (!(await assertOwnsSubscriber(env, a, subscriberDeleteMatch[1]))) return jsonResponse({ error: "not_found" }, 404);
    return deleteSubscriber(env, subscriberDeleteMatch[1]);
  }

  const subscriberPatchMatch = /^\/api\/subscribers\/(\w+)$/.exec(path);
  if (method === "PATCH" && subscriberPatchMatch) {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    if (!(await assertOwnsSubscriber(env, a, subscriberPatchMatch[1]))) return jsonResponse({ error: "not_found" }, 404);
    return patchSubscriber(env, subscriberPatchMatch[1], request);
  }

  if (method === "GET" && path === "/api/insulin-log") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const hours = Number(url.searchParams.get("hours") ?? "720");
    return getInsulinLog(env, personId, Number.isFinite(hours) && hours > 0 ? hours : 720);
  }

  if (method === "POST" && path === "/api/insulin-log") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postInsulinLog(env, request, a, now);
  }

  const insulinLogDeleteMatch = /^\/api\/insulin-log\/(\w+)$/.exec(path);
  if (method === "DELETE" && insulinLogDeleteMatch) {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    if (!(await assertOwnsInsulinLogEntry(env, a, insulinLogDeleteMatch[1]))) return jsonResponse({ error: "not_found" }, 404);
    return deleteInsulinLog(env, insulinLogDeleteMatch[1]);
  }

  if (method === "GET" && path === "/api/billing") {
    return getBilling(env, a);
  }

  if (method === "POST" && path === "/api/billing/portal") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postBillingPortal(env, a, request);
  }

  if (method === "GET" && path === "/api/support/tickets") {
    return getTickets(env, a);
  }

  if (method === "POST" && path === "/api/support/tickets") {
    return postTicket(env, a, request, now);
  }

  const ticketGetMatch = /^\/api\/support\/tickets\/(\w+)$/.exec(path);
  if (method === "GET" && ticketGetMatch) {
    return getTicket(env, a, ticketGetMatch[1]);
  }

  const ticketPatchMatch = /^\/api\/support\/tickets\/(\w+)$/.exec(path);
  if (method === "PATCH" && ticketPatchMatch) {
    return patchTicketStatus(env, a, ticketPatchMatch[1], request, now);
  }

  const ticketReplyMatch = /^\/api\/support\/tickets\/(\w+)\/reply$/.exec(path);
  if (method === "POST" && ticketReplyMatch) {
    return postTicketReply(env, a, ticketReplyMatch[1], request, now);
  }

  if (method === "GET" && path === "/api/doctors") {
    return getDoctors(env, a);
  }

  if (method === "POST" && path === "/api/doctors/invite") {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return postDoctorInvite(env, a, request, now);
  }

  const doctorDeleteMatch = /^\/api\/doctors\/(\S+)$/.exec(path);
  if (method === "DELETE" && doctorDeleteMatch) {
    const writeGuard = requireWriteAccess(a);
    if (writeGuard) return writeGuard;
    return deleteDoctor(env, a, doctorDeleteMatch[1]);
  }

  return jsonResponse({ error: "not_found" }, 404);
}
