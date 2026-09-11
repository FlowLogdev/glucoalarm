import { classifyTier, isStale, type Person, type Tier } from "./lib/alerts";
import { bearerToken, getSessionAdmin, login, logout, type Admin } from "./auth";
import { getReport, REPORT_PERIODS, type ReportPeriod } from "./reports";
import { getA1CEstimates } from "./a1c";
import { postSetupAssistant } from "./setup-assistant";
import { generateInsight, getCachedInsight } from "./insights";
import { postSignupCheckout, postSignupComplete, postPeople } from "./signup";
import { getBilling, postBillingPortal } from "./billing";
import { getTickets, getTicket, postTicket, postTicketReply, patchTicketStatus, postPublicTicket } from "./support";
import type { Env } from "./types";

const TICKER_INTERVAL_OPTIONS = new Set([5, 10, 15, 20, 30, 60]);
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

const PERSON_COLUMNS = `id, name, safe_low, safe_high, critical_low, critical_high, stale_minutes, carb_ratio, correction_factor, target_glucose, timezone, ticker_interval_minutes`;

interface PersonWithDosing extends Person {
  carb_ratio: number | null;
  correction_factor: number | null;
  target_glucose: number | null;
  timezone: string | null;
  ticker_interval_minutes: number;
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
      `SELECT id, person_id, phone_number, label, call_on_low, call_priority FROM phone_subscribers WHERE person_id = ? ORDER BY call_priority ASC`
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

async function postSubscriber(env: Env, request: Request, admin: Admin): Promise<Response> {
  const body = await request.json<{
    person_id?: string;
    phone_number?: string;
    label?: string;
    call_on_low?: boolean;
    call_priority?: number;
  }>();
  if (!body.person_id || !body.phone_number) {
    return jsonResponse({ error: "person_id and phone_number are required" }, 400);
  }
  if (!E164.test(body.phone_number)) {
    return jsonResponse({ error: "phone_number must be E.164 format, e.g. +13055551234" }, 400);
  }
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
      `INSERT INTO phone_subscribers (person_id, phone_number, label, call_on_low, call_priority) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(body.person_id, body.phone_number, body.label ?? null, body.call_on_low ? 1 : 0, body.call_priority ?? 0)
    .run();
  return jsonResponse({ id: result.meta.last_row_id }, 201);
}

async function patchSubscriber(env: Env, id: string, request: Request): Promise<Response> {
  if (!/^\d+$/.test(id)) return jsonResponse({ error: "invalid id" }, 400);
  const body = await request.json<{ call_on_low?: boolean; call_priority?: number }>();
  if (body.call_on_low == null && body.call_priority == null) {
    return jsonResponse({ error: "call_on_low or call_priority is required" }, 400);
  }

  const current = await env.DB
    .prepare(`SELECT call_on_low, call_priority FROM phone_subscribers WHERE id = ?`)
    .bind(id)
    .first<{ call_on_low: number; call_priority: number }>();
  if (!current) return jsonResponse({ error: "not_found" }, 404);

  const result = await env.DB
    .prepare(`UPDATE phone_subscribers SET call_on_low = ?, call_priority = ? WHERE id = ?`)
    .bind(
      body.call_on_low != null ? (body.call_on_low ? 1 : 0) : current.call_on_low,
      body.call_priority ?? current.call_priority,
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

  if (method === "POST" && path === "/api/support/public-tickets") {
    return postPublicTicket(env, request, now);
  }

  // Every route below requires a session (enforced in handleApi), so `admin` is non-null here.
  const a = admin as Admin;

  if (method === "GET" && path === "/api/people") {
    return getPeople(env, a);
  }

  if (method === "POST" && path === "/api/people") {
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

  if (method === "POST" && path === "/api/setup-assistant") {
    return postSetupAssistant(env, request);
  }

  if (method === "GET" && path === "/api/a1c") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    const estimates = await getA1CEstimates(env, personId, now);
    if (!estimates) return jsonResponse({ error: "person_not_found" }, 404);
    return jsonResponse(estimates);
  }

  if (method === "GET" && path === "/api/subscribers") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    if (!(await assertOwnsPerson(env, a, personId))) return jsonResponse({ error: "person_not_found" }, 404);
    return getSubscribers(env, personId);
  }

  if (method === "POST" && path === "/api/settings/thresholds") {
    return postThresholds(env, request, a);
  }

  if (method === "POST" && path === "/api/settings/dosing") {
    return postDosingSettings(env, request, a);
  }

  if (method === "POST" && path === "/api/settings/timezone") {
    return postTimezone(env, request, a);
  }

  if (method === "POST" && path === "/api/settings/ticker-interval") {
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
    return postSubscriber(env, request, a);
  }

  const subscriberDeleteMatch = /^\/api\/subscribers\/(\w+)$/.exec(path);
  if (method === "DELETE" && subscriberDeleteMatch) {
    if (!(await assertOwnsSubscriber(env, a, subscriberDeleteMatch[1]))) return jsonResponse({ error: "not_found" }, 404);
    return deleteSubscriber(env, subscriberDeleteMatch[1]);
  }

  const subscriberPatchMatch = /^\/api\/subscribers\/(\w+)$/.exec(path);
  if (method === "PATCH" && subscriberPatchMatch) {
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
    return postInsulinLog(env, request, a, now);
  }

  const insulinLogDeleteMatch = /^\/api\/insulin-log\/(\w+)$/.exec(path);
  if (method === "DELETE" && insulinLogDeleteMatch) {
    if (!(await assertOwnsInsulinLogEntry(env, a, insulinLogDeleteMatch[1]))) return jsonResponse({ error: "not_found" }, 404);
    return deleteInsulinLog(env, insulinLogDeleteMatch[1]);
  }

  if (method === "GET" && path === "/api/billing") {
    return getBilling(env, a);
  }

  if (method === "POST" && path === "/api/billing/portal") {
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

  return jsonResponse({ error: "not_found" }, 404);
}
