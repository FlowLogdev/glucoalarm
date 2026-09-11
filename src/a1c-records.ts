import type { Env } from "./types";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Real laboratory A1C values -- a distinct concept from the estimated GMI
 * in src/a1c.ts. Never conflated in the UI or API: this table only ever
 * holds a person's actual lab results, entered manually (no Dexcom/lab
 * integration exists to auto-import these).
 */
export async function getA1CRecords(env: Env, personId: string): Promise<Response> {
  const records = await env.DB
    .prepare(`SELECT id, a1c_value, measured_at, source, notes FROM a1c_records WHERE person_id = ? ORDER BY measured_at DESC`)
    .bind(personId)
    .all();
  return jsonResponse(records.results);
}

export async function postA1CRecord(
  env: Env,
  personId: string,
  body: { a1c_value?: number; measured_at?: number; source?: string; notes?: string },
  now: number
): Promise<Response> {
  if (body.a1c_value == null || body.a1c_value <= 0 || body.a1c_value > 20) {
    return jsonResponse({ error: "a1c_value must be a plausible percentage (0-20)" }, 400);
  }
  if (!body.measured_at) {
    return jsonResponse({ error: "measured_at is required" }, 400);
  }

  const result = await env.DB
    .prepare(`INSERT INTO a1c_records (person_id, a1c_value, measured_at, source, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(personId, body.a1c_value, body.measured_at, body.source ?? null, body.notes ?? null, now)
    .run();

  return jsonResponse({ id: result.meta.last_row_id }, 201);
}

export async function deleteA1CRecord(env: Env, personId: string, recordId: string): Promise<Response> {
  if (!/^\d+$/.test(recordId)) return jsonResponse({ error: "invalid id" }, 400);
  const result = await env.DB.prepare(`DELETE FROM a1c_records WHERE id = ? AND person_id = ?`).bind(recordId, personId).run();
  if (result.meta.changes === 0) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({ ok: true });
}
