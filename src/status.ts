import { isStale } from "./lib/alerts";
import { pollPerson, type PersonRow } from "./poll";
import type { Env } from "./types";

export type ServiceStatus = "connected" | "connecting" | "down";

export interface StatusResult {
  status: ServiceStatus;
  detail: string;
  lastReadingAt: number | null;
  subscriptionStatus: string;
}

/**
 * There's no literal per-customer "service" to check -- the same global
 * cron polls everyone. "Status" here means: is this account's data
 * actually flowing right now. Down covers both real causes: an inactive
 * subscription (never polled) and a stale Dexcom connection (polled, but
 * not getting fresh data back).
 */
async function computeStatus(env: Env, personId: string, now: number): Promise<StatusResult | null> {
  const row = await env.DB
    .prepare(
      `SELECT people.stale_minutes as stale_minutes, customers.subscription_status as subscription_status
       FROM people JOIN customers ON customers.id = people.customer_id WHERE people.id = ?`
    )
    .bind(personId)
    .first<{ stale_minutes: number; subscription_status: string }>();
  if (!row) return null;

  if (row.subscription_status !== "active") {
    return {
      status: "down",
      detail: "Subscription is not active.",
      lastReadingAt: null,
      subscriptionStatus: row.subscription_status,
    };
  }

  const lastReading = await env.DB
    .prepare(`SELECT received_at, recorded_at FROM readings WHERE person_id = ? ORDER BY recorded_at DESC LIMIT 1`)
    .bind(personId)
    .first<{ received_at: number; recorded_at: number }>();

  if (!lastReading) {
    return {
      status: "connecting",
      detail: "Waiting for the first reading from Dexcom.",
      lastReadingAt: null,
      subscriptionStatus: row.subscription_status,
    };
  }

  if (isStale(now, lastReading.received_at, row.stale_minutes)) {
    return {
      status: "down",
      detail: "No new data from Dexcom recently.",
      lastReadingAt: lastReading.recorded_at,
      subscriptionStatus: row.subscription_status,
    };
  }

  return {
    status: "connected",
    detail: "Live and receiving data.",
    lastReadingAt: lastReading.recorded_at,
    subscriptionStatus: row.subscription_status,
  };
}

export async function getStatus(env: Env, personId: string, now: number): Promise<StatusResult | null> {
  return computeStatus(env, personId, now);
}

/**
 * The two real levers a "restart" can pull in this architecture: force a
 * fresh Dexcom re-authentication instead of reusing a possibly-bad cached
 * session, and poll immediately rather than waiting for the next 5-min
 * cron tick. Not a fake button -- both actions genuinely run.
 */
export async function restartService(env: Env, personId: string, now: number): Promise<StatusResult | null> {
  const person = await env.DB.prepare(`SELECT * FROM people WHERE id = ?`).bind(personId).first<PersonRow>();
  if (!person) return null;

  await env.DB
    .prepare(`UPDATE people SET dexcom_session_id = NULL, dexcom_session_expires_at = NULL WHERE id = ?`)
    .bind(personId)
    .run();
  person.dexcom_session_id = null;
  person.dexcom_session_expires_at = null;

  try {
    await pollPerson(person, env, now);
  } catch (err) {
    console.error(`restartService: pollPerson failed for ${personId}:`, err);
  }

  return computeStatus(env, personId, now);
}
