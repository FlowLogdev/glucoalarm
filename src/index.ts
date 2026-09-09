import { MockDexcomClient } from "./lib/dexcom-client-mock";
import { DexcomShareClient, DexcomSessionError } from "./lib/dexcom-client-share";
import type { DexcomClient, Reading } from "./lib/dexcom-client";
import { classifyAlert, classifyTier, isStale, isInCooldown, type AlertType, type Person } from "./lib/alerts";
import { sendWhatsApp, messageFor } from "./lib/whatsapp";
import { makeVoiceCall, callMessageFor } from "./lib/voice";
import { decrypt } from "./lib/crypto";
import { handleApi } from "./api";
import { handleCallAck } from "./calls-webhook";
import { bearerToken, getSessionAdmin } from "./auth";
import type { Env } from "./types";

interface PersonRow extends Person {
  dexcom_username: string;
  dexcom_password: string; // AES-GCM encrypted, see src/lib/crypto.ts
  dexcom_session_id: string | null;
  dexcom_session_expires_at: number | null;
  timezone: string | null;
  last_low_call_at: number | null;
  low_call_acknowledged: number;
  low_call_critical_escalated: number;
}

// Re-authenticate a bit before Dexcom's ~24h session expiry rather than at it.
const SESSION_TTL_SECONDS = 23 * 60 * 60;

// Calls repeat every 5 min while low and unacknowledged (a person pressing
// 1 on the call stops further repeats until the tier returns to safe).
const LOW_CALL_REPEAT_SECONDS = 5 * 60;

async function cacheSession(
  person: PersonRow,
  env: Env,
  sessionId: string,
  now: number
): Promise<void> {
  const expiresAt = now + SESSION_TTL_SECONDS;
  await env.DB
    .prepare(`UPDATE people SET dexcom_session_id = ?, dexcom_session_expires_at = ? WHERE id = ?`)
    .bind(sessionId, expiresAt, person.id)
    .run();
  person.dexcom_session_id = sessionId;
  person.dexcom_session_expires_at = expiresAt;
}

async function authenticate(
  person: PersonRow,
  env: Env,
  client: DexcomShareClient,
  now: number
): Promise<string> {
  const password = await decrypt(person.dexcom_password, env.DEXCOM_ENC_KEY);
  const { sessionId } = await client.authenticate(person.dexcom_username, password);
  await cacheSession(person, env, sessionId, now);
  return sessionId;
}

async function getSession(
  person: PersonRow,
  env: Env,
  client: DexcomShareClient,
  now: number
): Promise<string> {
  if (person.dexcom_session_id && person.dexcom_session_expires_at && now < person.dexcom_session_expires_at) {
    return person.dexcom_session_id;
  }
  return authenticate(person, env, client, now);
}

async function fetchDexcomReadings(
  person: PersonRow,
  env: Env,
  lastRecordedAt: number | null,
  now: number
): Promise<Reading[]> {
  const client = new DexcomShareClient(env.DEXCOM_BASE_URL, env.DEXCOM_APPLICATION_ID);
  const minutes = lastRecordedAt ? Math.ceil((now - lastRecordedAt) / 60) + 2 : 1440;

  let sessionId = await getSession(person, env, client, now);
  try {
    return await client.getLatestReadings(sessionId, minutes);
  } catch (err) {
    if (!(err instanceof DexcomSessionError)) throw err;
    // Cached session was rejected — re-authenticate once and retry.
    sessionId = await authenticate(person, env, client, now);
    return await client.getLatestReadings(sessionId, minutes);
  }
}

async function fetchNewReadings(
  person: PersonRow,
  env: Env,
  lastRecordedAt: number | null,
  now: number
): Promise<Reading[]> {
  let readings: Reading[];

  if (env.DEXCOM_MODE === "dexcom") {
    readings = await fetchDexcomReadings(person, env, lastRecordedAt, now);
  } else {
    const client: DexcomClient = new MockDexcomClient();
    const lastValue = await env.DB
      .prepare(`SELECT value_mgdl FROM readings WHERE person_id = ? ORDER BY recorded_at DESC LIMIT 1`)
      .bind(person.id)
      .first<{ value_mgdl: number }>();
    readings = [(client as MockDexcomClient).nextReading(lastValue?.value_mgdl ?? null)];
  }

  return readings.filter((r) => r.timestamp > (lastRecordedAt ?? 0));
}

async function pollPerson(person: PersonRow, env: Env, now: number): Promise<void> {
  const lastReading = await env.DB
    .prepare(
      `SELECT value_mgdl, trend, recorded_at, received_at FROM readings WHERE person_id = ? ORDER BY recorded_at DESC LIMIT 1`
    )
    .bind(person.id)
    .first<{ value_mgdl: number; trend: string; recorded_at: number; received_at: number }>();

  const newReadings = await fetchNewReadings(person, env, lastReading?.recorded_at ?? null, now);

  for (const r of newReadings) {
    await env.DB
      .prepare(
        `INSERT INTO readings (person_id, value_mgdl, trend, recorded_at, received_at) VALUES (?, ?, ?, ?, ?)`
      )
      .bind(person.id, r.value, r.trend, r.timestamp, now)
      .run();
  }

  if (newReadings.length === 0 && !lastReading) return; // no data at all yet

  const latest = newReadings[newReadings.length - 1] ?? null;
  const value = latest?.value ?? lastReading!.value_mgdl;
  const trend = latest?.trend ?? lastReading?.trend ?? null;
  const recordedAt = latest?.timestamp ?? lastReading!.recorded_at;
  const lastReceivedAt = latest ? now : lastReading!.received_at;

  const lastAlert = await env.DB
    .prepare(
      `SELECT type, sent_at FROM alerts_log WHERE person_id = ? ORDER BY sent_at DESC LIMIT 1`
    )
    .bind(person.id)
    .first<{ type: AlertType; sent_at: number }>();

  let alertType: AlertType | null = null;

  if (isStale(now, lastReceivedAt, person.stale_minutes)) {
    alertType = "signal_lost";
  } else {
    alertType = classifyAlert(person, value, lastAlert?.type ?? null);
    if (!alertType && lastAlert?.type === "signal_lost") {
      alertType = "signal_restored";
    }
  }

  const tier = classifyTier(person, value);
  const isLowTier = tier === "warn_low" || tier === "critical_low";

  // Reset low-call escalation state as soon as we're back in a safe tier,
  // regardless of whether a "recovered" message also happens to fire this
  // poll -- otherwise a future low episode could inherit a stale
  // acknowledgment and silently skip calling.
  if (!isLowTier && (person.low_call_acknowledged || person.low_call_critical_escalated)) {
    await env.DB
      .prepare(`UPDATE people SET low_call_acknowledged = 0, low_call_critical_escalated = 0 WHERE id = ?`)
      .bind(person.id)
      .run();
    person.low_call_acknowledged = 0;
    person.low_call_critical_escalated = 0;
  }

  if (!alertType) return;

  const lastSameTypeAlert = await env.DB
    .prepare(
      `SELECT sent_at FROM alerts_log WHERE person_id = ? AND type = ? ORDER BY sent_at DESC LIMIT 1`
    )
    .bind(person.id, alertType)
    .first<{ sent_at: number }>();

  if (isInCooldown(now, alertType, lastSameTypeAlert?.sent_at ?? null)) return;

  const subscribers = await env.DB
    .prepare(
      `SELECT phone_number, call_on_low FROM phone_subscribers WHERE person_id = ? ORDER BY call_priority ASC`
    )
    .bind(person.id)
    .all<{ phone_number: string; call_on_low: number }>();

  // The reading's actual time, not "now" -- otherwise a repeated alert on a
  // stale value looks like fresh data is still arriving every cooldown tick.
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: person.timezone ?? "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(recordedAt * 1000));
  const body = messageFor(alertType, person.name, value, trend, person.stale_minutes, time);

  for (const sub of subscribers.results) {
    try {
      await sendWhatsApp(sub.phone_number, body, env);
    } catch (err) {
      // Don't let one bad number block the rest, or skip alerts_log below
      // and cause a resend storm next cron run.
      console.error(`sendWhatsApp failed for ${person.id} -> ${sub.phone_number}:`, err);
    }
  }

  await env.DB
    .prepare(`INSERT INTO alerts_log (person_id, type, value_mgdl, sent_at) VALUES (?, ?, ?, ?)`)
    .bind(person.id, alertType, value, now)
    .run();

  if (isLowTier && !person.low_call_acknowledged) {
    const dueForRepeat = !person.last_low_call_at || now - person.last_low_call_at >= LOW_CALL_REPEAT_SECONDS;
    const dueForEscalation = tier === "critical_low" && !person.low_call_critical_escalated;

    if (dueForRepeat || dueForEscalation) {
      const callMessage = callMessageFor(person.name, value, time);
      const actionUrl = `${env.PUBLIC_WORKER_URL}/api/calls/ack?person_id=${encodeURIComponent(person.id)}`;
      let calledAnyone = false;
      for (const sub of subscribers.results) {
        if (!sub.call_on_low) continue;
        calledAnyone = true;
        try {
          await makeVoiceCall(sub.phone_number, callMessage, actionUrl, env);
        } catch (err) {
          console.error(`makeVoiceCall failed for ${person.id} -> ${sub.phone_number}:`, err);
        }
      }
      if (calledAnyone) {
        await env.DB
          .prepare(
            `UPDATE people SET last_low_call_at = ?, low_call_critical_escalated = MAX(low_call_critical_escalated, ?) WHERE id = ?`
          )
          .bind(now, dueForEscalation ? 1 : 0, person.id)
          .run();
      }
    }
  }
}

async function pollAll(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const people = await env.DB.prepare(`SELECT * FROM people`).all<PersonRow>();
  for (const person of people.results) {
    try {
      await pollPerson(person, env, now);
    } catch (err) {
      // One person's Dexcom/DB failure (bad session, network blip) shouldn't
      // stop the other person from being polled this cycle.
      console.error(`pollPerson failed for ${person.id}:`, err);
    }
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pollAll(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url0 = new URL(request.url);
    // Twilio webhook -- public by necessity (Twilio can't send our bearer
    // token), secured via its own signature verification instead. Must be
    // checked before handleApi, which would otherwise 401 it as an
    // unauthenticated /api/* request.
    if (request.method === "POST" && url0.pathname === "/api/calls/ack") {
      return handleCallAck(request, env);
    }

    const apiResponse = await handleApi(request, env, Math.floor(Date.now() / 1000));
    if (apiResponse) return apiResponse;

    // Manual trigger, e.g. for local testing: curl http://localhost:8787/__poll
    // Requires the same admin bearer token as /api/* so it can't be hit
    // anonymously once this is deployed and polling real Dexcom/Twilio.
    const url = new URL(request.url);
    if (url.pathname === "/__poll") {
      const token = bearerToken(request);
      const admin = token ? await getSessionAdmin(env, token, Math.floor(Date.now() / 1000)) : null;
      if (!admin) return new Response("unauthorized\n", { status: 401 });
      await pollAll(env);
      return new Response("polled\n");
    }
    return new Response("watchgluco worker\n");
  },
};
