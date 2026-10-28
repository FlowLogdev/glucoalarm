import { isStale } from "./lib/alerts";
import { sendWhatsApp } from "./lib/whatsapp";
import type { Env } from "./types";

// Operator monitoring behind the super-admin logs console (/admin). Errors
// used to go only to console.error, which nobody could see -- the
// 2026-10-28 outage (Dexcom 429 on every login) ran silently for 7+ hours.

const ERROR_LOG_RETENTION_SECONDS = 30 * 24 * 60 * 60;
// While a person stays down, re-page the operator this often rather than
// every 5-min tick.
const OPS_DOWN_REMINDER_SECONDS = 60 * 60;
// An error this recent marks a person "degraded" even if data isn't stale yet.
const RECENT_ERROR_SECONDS = 15 * 60;

export type ErrorSource = "dexcom" | "whatsapp" | "voice" | "poll" | "api" | "webhook";

/** Never throws -- logging a failure must not cause another one. */
export async function logError(env: Env, source: ErrorSource, personId: string | null, err: unknown): Promise<void> {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  try {
    await env.DB
      .prepare(`INSERT INTO error_log (created_at, source, person_id, message) VALUES (?, ?, ?, ?)`)
      .bind(Math.floor(Date.now() / 1000), source, personId, message.slice(0, 2000))
      .run();
  } catch (logErr) {
    console.error("logError: insert failed:", logErr);
  }
}

export async function pruneErrorLog(env: Env, now: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM error_log WHERE created_at < ?`).bind(now - ERROR_LOG_RETENTION_SECONDS).run();
}

export interface Diagnosis {
  severity: "critical" | "warning" | "info";
  cause: string;
  fix: string;
}

/** Rule-based: maps a logged error (or its absence) to a likely cause and fix. */
export function diagnose(status: PersonStatus, message: string | null, inDexcomBackoff = false): Diagnosis | null {
  if (status === "inactive") {
    return { severity: "info", cause: "Subscription is not active, so this person is not polled.", fix: "Nothing to fix unless the customer says they paid -- check Billing/Stripe/RevenueCat." };
  }
  if (status === "demo") return null;

  const severity = status === "down" || status === "no_data" ? "critical" : "warning";
  // The backoff marker itself proves a 429, even if it predates error_log.
  if (inDexcomBackoff || (message && /\(429\)|too many requests/i.test(message))) {
    return { severity, cause: "Dexcom is rate-limiting logins for this account (HTTP 429).", fix: "Automatic: the poller waits 30 min between login attempts. If it lasts for hours, check that no other app (Sugarmate, Nightscout, xDrip, a watch app) logs in with this Dexcom username/password." };
  }
  if (message) {
    if (/AccountPasswordInvalid|invalid credentials/i.test(message)) {
      return { severity, cause: "Dexcom rejected the stored password.", fix: "The customer probably changed their Dexcom password -- get the new one from them and update it." };
    }
    if (/AccountNotFound/i.test(message)) {
      return { severity, cause: "Dexcom says this username doesn't exist.", fix: "The Dexcom username on file is wrong -- confirm it with the customer." };
    }
    if (/MaxAttempts|locked/i.test(message)) {
      return { severity, cause: "Dexcom locked the account after too many failed logins.", fix: "Wait for the lock to clear, or have the customer reset the password at uam1.dexcom.com." };
    }
    if (/63016/.test(message)) {
      return { severity, cause: "Twilio rejected a free-form WhatsApp message outside the 24h window (63016).", fix: "Send through the approved Content Template (WHATSAPP_TEMPLATE_SID) instead of a Body message." };
    }
    if (/63027|template/i.test(message)) {
      return { severity, cause: "Twilio couldn't find or use the WhatsApp template.", fix: "Check the template's WhatsApp approval in Twilio Console > Content Template Builder and the WHATSAPP_TEMPLATE_SID var." };
    }
    if (/21211|21614|Invalid 'To'/i.test(message)) {
      return { severity, cause: "A subscriber phone number is invalid.", fix: "Fix the number in the customer's Settings (E.164 format, e.g. +13055551234)." };
    }
    if (/Twilio/i.test(message)) {
      return { severity, cause: "A Twilio send failed.", fix: "Open Twilio Console > Monitor > Logs for the error code; check account balance and credentials." };
    }
    if (/\(5\d\d\)|fetch failed|network|timed? ?out/i.test(message)) {
      return { severity, cause: "Dexcom or Twilio returned a server/network error.", fix: "Usually temporary on their side -- it should recover on its own. If it lasts more than an hour, check status.dexcom.com / status.twilio.com." };
    }
    return { severity, cause: "Unrecognized error.", fix: "Read the full message in the error log below." };
  }
  if (status === "down") {
    return { severity, cause: "Dexcom logins work but no new readings are coming in.", fix: "Usually the customer's side: sensor expired or warming up, phone off/out of range, or Dexcom Share turned off. Contact the customer." };
  }
  if (status === "no_data") {
    return { severity, cause: "No reading has ever been received.", fix: "Check the Dexcom credentials and that Share is enabled; signup may be incomplete." };
  }
  return null;
}

export type PersonStatus = "ok" | "degraded" | "down" | "no_data" | "inactive" | "demo";

export interface PersonHealth {
  person_id: string;
  name: string;
  customer_id: string;
  customer_name: string;
  subscription_status: string;
  subscribers: number;
  last_reading_at: number | null;
  last_value: number | null;
  status: PersonStatus;
  dexcom_retry_after: number | null;
  last_error: { source: string; message: string; created_at: number } | null;
  errors_24h: number;
  diagnosis: Diagnosis | null;
}

export async function scanHealth(env: Env, now: number): Promise<PersonHealth[]> {
  // Latest reading via ORDER BY ... LIMIT 1 so it uses
  // idx_readings_person_recorded instead of scanning every reading.
  const rows = await env.DB
    .prepare(
      `SELECT p.id, p.name, p.stale_minutes, p.dexcom_session_id, p.dexcom_session_expires_at,
              c.id AS customer_id, c.display_name AS customer_name, c.subscription_status, c.is_app_review_demo,
              (SELECT COUNT(*) FROM phone_subscribers s WHERE s.person_id = p.id) AS subscribers,
              (SELECT received_at FROM readings r WHERE r.person_id = p.id ORDER BY recorded_at DESC LIMIT 1) AS last_reading_at,
              (SELECT value_mgdl FROM readings r WHERE r.person_id = p.id ORDER BY recorded_at DESC LIMIT 1) AS last_value
       FROM people p JOIN customers c ON c.id = p.customer_id
       ORDER BY c.created_at`
    )
    .all<{
      id: string;
      name: string;
      stale_minutes: number;
      dexcom_session_id: string | null;
      dexcom_session_expires_at: number | null;
      customer_id: string;
      customer_name: string;
      subscription_status: string;
      is_app_review_demo: number;
      subscribers: number;
      last_reading_at: number | null;
      last_value: number | null;
    }>();

  const results: PersonHealth[] = [];
  for (const row of rows.results) {
    const lastError = await env.DB
      .prepare(`SELECT source, message, created_at FROM error_log WHERE person_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(row.id)
      .first<{ source: string; message: string; created_at: number }>();
    const errors24h = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM error_log WHERE person_id = ? AND created_at >= ?`)
      .bind(row.id, now - 24 * 60 * 60)
      .first<{ n: number }>();

    let status: PersonStatus;
    if (row.is_app_review_demo) status = "demo";
    else if (row.subscription_status !== "active") status = "inactive";
    else if (row.last_reading_at == null) status = "no_data";
    else if (isStale(now, row.last_reading_at, row.stale_minutes)) status = "down";
    else if (lastError && now - lastError.created_at < RECENT_ERROR_SECONDS) status = "degraded";
    else status = "ok";

    // Only an error newer than the last good reading explains the current state.
    const relevantError =
      lastError && (status === "down" || status === "no_data" || status === "degraded") && lastError.created_at >= (row.last_reading_at ?? 0)
        ? lastError
        : null;

    // poll.ts's rate-limit backoff marker: null session + future expiry.
    const dexcomRetryAfter =
      !row.dexcom_session_id && row.dexcom_session_expires_at && row.dexcom_session_expires_at > now ? row.dexcom_session_expires_at : null;

    results.push({
      person_id: row.id,
      name: row.name,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      subscription_status: row.subscription_status,
      subscribers: row.subscribers,
      last_reading_at: row.last_reading_at,
      last_value: row.last_value,
      status,
      dexcom_retry_after: dexcomRetryAfter,
      last_error: lastError ?? null,
      errors_24h: errors24h?.n ?? 0,
      diagnosis: diagnose(status, relevantError?.message ?? null, dexcomRetryAfter != null),
    });
  }
  return results;
}

async function getOpsState(env: Env, key: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT value FROM ops_state WHERE key = ?`).bind(key).first<{ value: string | null }>();
  return row?.value ?? null;
}

async function setOpsState(env: Env, key: string, value: string, now: number): Promise<void> {
  await env.DB
    .prepare(`INSERT INTO ops_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, value, now)
    .run();
}

export async function getLastCronRun(env: Env): Promise<number | null> {
  const value = await getOpsState(env, "cron:last_run");
  return value ? Number(value) : null;
}

/**
 * Runs after every poll. Records the cron heartbeat and pages the operator
 * (OPS_ALERT_PHONE) when a paying customer's monitoring goes down, again
 * hourly while it stays down, and once when it recovers.
 */
export async function runOpsChecks(env: Env, now: number): Promise<void> {
  await setOpsState(env, "cron:last_run", String(now), now);
  if (!env.OPS_ALERT_PHONE) return;

  const health = await scanHealth(env, now);
  for (const h of health) {
    if (h.status === "demo" || h.status === "inactive") continue;
    const isDown = h.status === "down" || h.status === "no_data";
    const key = `person:${h.person_id}`;
    const prev = await getOpsState(env, key);
    const prevState = prev ? (JSON.parse(prev) as { down: boolean; alerted_at: number }) : { down: false, alerted_at: 0 };

    let headline: string | null = null;
    if (isDown && (!prevState.down || now - prevState.alerted_at >= OPS_DOWN_REMINDER_SECONDS)) {
      headline = `🛠️ OPS: ${prevState.down ? "STILL DOWN" : "MONITORING DOWN"} - ${h.diagnosis?.cause ?? "no new data"}`;
    } else if (!isDown && prevState.down) {
      headline = "🛠️ OPS: RECOVERED";
    }

    if (headline) {
      try {
        // Same approved template as glucose alerts ({{1}} headline, {{2}}
        // name, {{3}}/{{4}} value/trend, {{5}} time) -- business-initiated
        // templates are the only WhatsApp sends not limited to the 24h window.
        await sendWhatsApp(
          env.OPS_ALERT_PHONE,
          {
            "1": headline.slice(0, 200),
            "2": `${h.name} (${h.customer_name})`,
            "3": h.last_value != null ? String(h.last_value) : "N/A",
            "4": "N/A",
            "5": "Details: logs.glucoalarm.com",
          },
          env
        );
      } catch (err) {
        console.error(`runOpsChecks: ops alert failed for ${h.person_id}:`, err);
      }
      await setOpsState(env, key, JSON.stringify({ down: isDown, alerted_at: now }), now);
    } else if (isDown !== prevState.down) {
      await setOpsState(env, key, JSON.stringify({ down: isDown, alerted_at: prevState.alerted_at }), now);
    }
  }
}

export async function getErrorLog(
  env: Env,
  opts: { since: number; personId?: string | null; source?: string | null; limit: number }
): Promise<Array<{ id: number; created_at: number; source: string; person_id: string | null; message: string }>> {
  const where = ["created_at >= ?"];
  const binds: unknown[] = [opts.since];
  if (opts.personId) {
    where.push("person_id = ?");
    binds.push(opts.personId);
  }
  if (opts.source) {
    where.push("source = ?");
    binds.push(opts.source);
  }
  const rows = await env.DB
    .prepare(`SELECT id, created_at, source, person_id, message FROM error_log WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`)
    .bind(...binds, opts.limit)
    .all<{ id: number; created_at: number; source: string; person_id: string | null; message: string }>();
  return rows.results;
}

export async function getUserCounts(env: Env, now: number) {
  const customers = await env.DB
    .prepare(`SELECT subscription_status, COUNT(*) AS n FROM customers WHERE is_app_review_demo = 0 GROUP BY subscription_status`)
    .all<{ subscription_status: string; n: number }>();
  const totals = await env.DB
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM admins) AS logins,
         (SELECT COUNT(*) FROM people) AS monitored_people,
         (SELECT COUNT(*) FROM phone_subscribers) AS phone_subscribers,
         (SELECT COUNT(*) FROM customers WHERE is_app_review_demo = 0 AND created_at >= ?) AS signups_7d,
         (SELECT COUNT(*) FROM customers WHERE is_app_review_demo = 0 AND created_at >= ?) AS signups_30d`
    )
    .bind(now - 7 * 86400, now - 30 * 86400)
    .first<{ logins: number; monitored_people: number; phone_subscribers: number; signups_7d: number; signups_30d: number }>();
  const byStatus = Object.fromEntries(customers.results.map((r) => [r.subscription_status, r.n]));
  return {
    customers_total: customers.results.reduce((sum, r) => sum + r.n, 0),
    customers_by_status: byStatus,
    ...totals,
  };
}

/** Security/business trail (logins, signups, billing webhooks, admin actions). Never throws. */
export async function logAudit(
  env: Env,
  e: { action: string; adminId?: string | null; customerId?: string | null; personId?: string | null; detail?: string | null; ip?: string | null }
): Promise<void> {
  try {
    await env.DB
      .prepare(`INSERT INTO audit_log (admin_id, customer_id, action, target_person_id, created_at, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(e.adminId ?? null, e.customerId ?? null, e.action, e.personId ?? null, Math.floor(Date.now() / 1000), e.detail?.slice(0, 500) ?? null, e.ip ?? null)
      .run();
  } catch (err) {
    console.error("logAudit failed:", err);
  }
}

/** Best-effort client IP: the web proxy forwards the browser's in X-Client-IP. Logging only -- never trust it for auth. */
export function clientIp(request: Request): string | null {
  return request.headers.get("X-Client-IP")?.split(",")[0].trim() || request.headers.get("CF-Connecting-IP");
}

export async function recordCronRun(env: Env, startedAt: number, durationMs: number, peoplePolled: number, errors: number): Promise<void> {
  try {
    await env.DB
      .prepare(`INSERT INTO cron_runs (started_at, duration_ms, people_polled, errors) VALUES (?, ?, ?, ?)`)
      .bind(startedAt, durationMs, peoplePolled, errors)
      .run();
  } catch (err) {
    console.error("recordCronRun failed:", err);
  }
}

export async function pruneOpsLogs(env: Env, now: number): Promise<void> {
  await env.DB.prepare(`DELETE FROM message_log WHERE created_at < ?`).bind(now - ERROR_LOG_RETENTION_SECONDS).run();
  await env.DB.prepare(`DELETE FROM cron_runs WHERE started_at < ?`).bind(now - ERROR_LOG_RETENTION_SECONDS).run();
  await env.DB.prepare(`DELETE FROM audit_log WHERE created_at < ?`).bind(now - 365 * 24 * 60 * 60).run();
}

// The */5 cron should never go this long without a run.
const CRON_STALE_SECONDS = 15 * 60;
const WATCHDOG_PAGE_COOLDOWN_SECONDS = 30 * 60;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * GET /api/ops/watchdog, called every 5 min by the GitHub Actions watchdog
 * (.github/workflows/watchdog.yml) -- outside Cloudflare's cron, so it
 * catches the one failure runOpsChecks can't: the cron itself not running.
 * If the cron is stale this pages the operator and runs a poll itself.
 * The workflow pages on its own (direct Twilio) when this endpoint is
 * unreachable or reports unhealthy without having paged.
 */
export async function handleWatchdog(request: Request, env: Env, runPoll: () => Promise<void>): Promise<Response> {
  const key = request.headers.get("X-Watchdog-Key") ?? "";
  if (!env.WATCHDOG_KEY || !timingSafeEqual(key, env.WATCHDOG_KEY)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = Math.floor(Date.now() / 1000);
  const lastCronRun = await getLastCronRun(env);
  const cronAge = lastCronRun ? now - lastCronRun : null;
  const cronHealthy = cronAge != null && cronAge < CRON_STALE_SECONDS;

  let paged = false;
  let selfHealed = false;
  if (!cronHealthy) {
    await logError(env, "poll", null, `Watchdog: cron has not run for ${cronAge == null ? "ever" : `${Math.round(cronAge / 60)} min`}`);
    const lastPage = Number((await getOpsState(env, "watchdog:paged_at")) ?? 0);
    if (env.OPS_ALERT_PHONE && now - lastPage >= WATCHDOG_PAGE_COOLDOWN_SECONDS) {
      try {
        await sendWhatsApp(
          env.OPS_ALERT_PHONE,
          {
            "1": `🛠️ OPS: POLLER STOPPED - no cron run for ${cronAge == null ? "ever" : `${Math.round(cronAge / 60)} min`}`,
            "2": "GlucoAlarm (all customers)",
            "3": "N/A",
            "4": "N/A",
            "5": "Details: logs.glucoalarm.com",
          },
          env
        );
        paged = true;
        await setOpsState(env, "watchdog:paged_at", String(now), now);
      } catch (err) {
        console.error("handleWatchdog: page failed:", err);
      }
    } else {
      paged = true; // already paged within the cooldown
    }
    // Keep customers covered while the cron is broken.
    try {
      await runPoll();
      selfHealed = true;
    } catch (err) {
      await logError(env, "poll", null, err);
    }
  }

  const health = await scanHealth(env, now);
  const down = health.filter((h) => h.status === "down" || h.status === "no_data");
  return Response.json({
    healthy: cronHealthy,
    last_cron_run: lastCronRun,
    cron_age_seconds: cronAge,
    worker_paged: paged,
    self_healed: selfHealed,
    people_down: down.map((h) => h.person_id),
  });
}

export async function getMessageLog(env: Env, since: number, to: string | null, limit: number) {
  const rows = to
    ? await env.DB
        .prepare(`SELECT * FROM message_log WHERE created_at >= ? AND to_number = ? ORDER BY created_at DESC LIMIT ?`)
        .bind(since, to, limit)
        .all()
    : await env.DB.prepare(`SELECT * FROM message_log WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`).bind(since, limit).all();
  return rows.results;
}

export async function getCronRuns(env: Env, since: number, limit: number) {
  return (await env.DB.prepare(`SELECT * FROM cron_runs WHERE started_at >= ? ORDER BY started_at DESC LIMIT ?`).bind(since, limit).all()).results;
}

export async function getAuditLog(env: Env, since: number, limit: number) {
  return (
    await env.DB
      .prepare(
        `SELECT audit_log.*, admins.email AS admin_email FROM audit_log LEFT JOIN admins ON admins.id = audit_log.admin_id
         WHERE audit_log.created_at >= ? ORDER BY audit_log.created_at DESC LIMIT ?`
      )
      .bind(since, limit)
      .all()
  ).results;
}

/** Support view: one row per customer with its logins, people, phones, and last activity. */
export async function getCustomers(env: Env) {
  return (
    await env.DB
      .prepare(
        `SELECT c.id, c.display_name, c.created_at, c.subscription_status, c.stripe_subscription_status, c.revenuecat_subscription_status, c.is_app_review_demo,
                (SELECT GROUP_CONCAT(email, ', ') FROM admins a WHERE a.customer_id = c.id) AS emails,
                (SELECT COUNT(*) FROM people p WHERE p.customer_id = c.id) AS people,
                (SELECT COUNT(*) FROM phone_subscribers s JOIN people p ON p.id = s.person_id WHERE p.customer_id = c.id) AS phones,
                (SELECT MAX(created_at) FROM audit_log l WHERE l.customer_id = c.id AND l.action = 'login') AS last_login
         FROM customers c ORDER BY c.created_at DESC`
      )
      .all()
  ).results;
}
