import { isStale, type Person } from "./lib/alerts";
import type { Env } from "./types";

type Status = "high" | "low" | "in_range" | "stale" | "no_data";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function corsHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers });
}

function computeStatus(
  person: Person,
  reading: { value_mgdl: number; received_at: number } | null,
  now: number
): Status {
  if (!reading) return "no_data";
  if (isStale(now, reading.received_at, person.stale_minutes)) return "stale";
  if (reading.value_mgdl <= person.low_threshold) return "low";
  if (reading.value_mgdl >= person.high_threshold) return "high";
  return "in_range";
}

async function getPeople(env: Env): Promise<Response> {
  const people = await env.DB
    .prepare(
      `SELECT id, name, low_threshold, high_threshold, stale_minutes FROM people`
    )
    .all<Person>();
  return jsonResponse(people.results);
}

async function getLatest(env: Env, personId: string, now: number): Promise<Response> {
  const person = await env.DB
    .prepare(
      `SELECT id, name, low_threshold, high_threshold, stale_minutes FROM people WHERE id = ?`
    )
    .bind(personId)
    .first<Person>();
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

async function getSubscribers(env: Env, personId: string): Promise<Response> {
  const subs = await env.DB
    .prepare(
      `SELECT id, person_id, phone_number, label FROM phone_subscribers WHERE person_id = ?`
    )
    .bind(personId)
    .all();
  return jsonResponse(subs.results);
}

async function postThresholds(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{
    person_id?: string;
    low?: number;
    high?: number;
    stale_minutes?: number;
  }>();
  if (!body.person_id || body.low == null || body.high == null || body.stale_minutes == null) {
    return jsonResponse({ error: "person_id, low, high, and stale_minutes are required" }, 400);
  }
  if (body.low >= body.high) {
    return jsonResponse({ error: "low must be less than high" }, 400);
  }
  const result = await env.DB
    .prepare(
      `UPDATE people SET low_threshold = ?, high_threshold = ?, stale_minutes = ? WHERE id = ?`
    )
    .bind(body.low, body.high, body.stale_minutes, body.person_id)
    .run();
  if (result.meta.changes === 0) return jsonResponse({ error: "person_not_found" }, 404);
  return jsonResponse({ ok: true });
}

const E164 = /^\+[1-9]\d{6,14}$/;

async function postSubscriber(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{ person_id?: string; phone_number?: string; label?: string }>();
  if (!body.person_id || !body.phone_number) {
    return jsonResponse({ error: "person_id and phone_number are required" }, 400);
  }
  if (!E164.test(body.phone_number)) {
    return jsonResponse({ error: "phone_number must be E.164 format, e.g. +13055551234" }, 400);
  }
  const person = await env.DB.prepare(`SELECT id FROM people WHERE id = ?`).bind(body.person_id).first();
  if (!person) return jsonResponse({ error: "person_not_found" }, 404);

  const result = await env.DB
    .prepare(`INSERT INTO phone_subscribers (person_id, phone_number, label) VALUES (?, ?, ?)`)
    .bind(body.person_id, body.phone_number, body.label ?? null)
    .run();
  return jsonResponse({ id: result.meta.last_row_id }, 201);
}

async function deleteSubscriber(env: Env, id: string): Promise<Response> {
  if (!/^\d+$/.test(id)) return jsonResponse({ error: "invalid id" }, 400);
  const result = await env.DB.prepare(`DELETE FROM phone_subscribers WHERE id = ?`).bind(id).run();
  if (result.meta.changes === 0) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({ ok: true });
}

export async function handleApi(request: Request, env: Env, now: number): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    return corsHeaders(new Response(null, { status: 204 }));
  }

  let response: Response;
  try {
    response = await route(request, url, env, now);
  } catch (err) {
    console.error("API error:", err);
    response = jsonResponse({ error: "internal_error" }, 500);
  }
  return corsHeaders(response);
}

async function route(request: Request, url: URL, env: Env, now: number): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  if (method === "GET" && path === "/api/people") {
    return getPeople(env);
  }

  if (method === "GET" && path === "/api/readings/latest") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    return getLatest(env, personId, now);
  }

  if (method === "GET" && path === "/api/readings/history") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    const hours = Number(url.searchParams.get("hours") ?? "24");
    return getHistory(env, personId, Number.isFinite(hours) && hours > 0 ? hours : 24);
  }

  if (method === "GET" && path === "/api/subscribers") {
    const personId = url.searchParams.get("person_id");
    if (!personId) return jsonResponse({ error: "person_id is required" }, 400);
    return getSubscribers(env, personId);
  }

  if (method === "POST" && path === "/api/settings/thresholds") {
    return postThresholds(env, request);
  }

  if (method === "POST" && path === "/api/subscribers") {
    return postSubscriber(env, request);
  }

  const subscriberDeleteMatch = /^\/api\/subscribers\/(\w+)$/.exec(path);
  if (method === "DELETE" && subscriberDeleteMatch) {
    return deleteSubscriber(env, subscriberDeleteMatch[1]);
  }

  return jsonResponse({ error: "not_found" }, 404);
}
