import type { Admin } from "./auth";
import type { Env } from "./types";

const PUSH_REPEAT_SECONDS = 5 * 60;
const FALLING_THRESHOLD_MGDL = 96;
const FALLING_TRENDS = new Set(["falling", "falling_fast"]);

export interface MobileAlert {
  person_id: string;
  person_name: string;
  started_at: number;
  last_value_mgdl: number;
  last_trend: string;
  last_reading_at: number;
  acknowledged_at: number | null;
}

function isExpoPushToken(value: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9-]+\]$/.test(value);
}

function isFallingBelowAlertThreshold(value: number, trend: string | null): boolean {
  return value < FALLING_THRESHOLD_MGDL && !!trend && FALLING_TRENDS.has(trend);
}

export async function registerMobilePushDevice(
  env: Env,
  admin: Admin,
  token: string,
  platform: string,
  now: number
): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;
  await env.DB
    .prepare(
      `INSERT INTO mobile_push_devices (admin_id, expo_push_token, platform, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(expo_push_token) DO UPDATE SET admin_id = excluded.admin_id, platform = excluded.platform, updated_at = excluded.updated_at`
    )
    .bind(admin.id, token, platform.slice(0, 24), now, now)
    .run();
  return true;
}

export async function getActiveMobileAlert(env: Env, personId: string): Promise<MobileAlert | null> {
  return env.DB
    .prepare(
      `SELECT mobile_alert_episodes.person_id, people.name AS person_name, mobile_alert_episodes.started_at,
              mobile_alert_episodes.last_value_mgdl, mobile_alert_episodes.last_trend,
              mobile_alert_episodes.last_reading_at, mobile_alert_episodes.acknowledged_at
       FROM mobile_alert_episodes JOIN people ON people.id = mobile_alert_episodes.person_id
       WHERE mobile_alert_episodes.person_id = ? AND mobile_alert_episodes.resolved_at IS NULL`
    )
    .bind(personId)
    .first<MobileAlert>();
}

export async function acknowledgeMobileAlert(env: Env, personId: string, adminId: string, now: number): Promise<boolean> {
  const result = await env.DB
    .prepare(
      `UPDATE mobile_alert_episodes
       SET acknowledged_at = COALESCE(acknowledged_at, ?), acknowledged_by_admin_id = COALESCE(acknowledged_by_admin_id, ?)
       WHERE person_id = ? AND resolved_at IS NULL`
    )
    .bind(now, adminId, personId)
    .run();
  return result.meta.changes > 0;
}

async function sendPushNotifications(
  env: Env,
  customerId: string | null,
  personId: string,
  personName: string,
  value: number,
  trend: string
): Promise<void> {
  const recipients = await env.DB
    .prepare(
      `SELECT DISTINCT mobile_push_devices.expo_push_token
       FROM mobile_push_devices JOIN admins ON admins.id = mobile_push_devices.admin_id
       WHERE admins.is_super_admin = 1 OR admins.customer_id = ?`
    )
    .bind(customerId)
    .all<{ expo_push_token: string }>();
  if (recipients.results.length === 0) return;

  const messages = recipients.results.map(({ expo_push_token }) => ({
    to: expo_push_token,
    sound: "default",
    priority: "high",
    title: "Glucose is falling",
    body: `${personName} is ${value} mg/dL and ${trend.replaceAll("_", " ")}. Tap to review and acknowledge.`,
    data: { type: "falling_glucose", personId },
  }));
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!response.ok) console.error(`Expo push delivery request failed: ${response.status}`);
  } catch (error) {
    console.error("Expo push delivery request failed:", error);
  }
}

/**
 * Creates an episode only when the reading is below 96 mg/dL and falling.
 * An open, unacknowledged episode repeats on the five-minute monitor cadence.
 * It resolves as soon as the reading is no longer below 96 and falling, so an
 * old alert cannot keep notifying after the patient has recovered.
 */
export async function updateMobileAlertEpisode(
  env: Env,
  person: { id: string; name: string; customer_id: string | null },
  value: number,
  trend: string | null,
  readingAt: number,
  now: number
): Promise<void> {
  const active = await getActiveMobileAlert(env, person.id);
  const stillFalling = isFallingBelowAlertThreshold(value, trend);

  if (!stillFalling) {
    if (active) {
      await env.DB.prepare(`UPDATE mobile_alert_episodes SET resolved_at = ? WHERE person_id = ? AND resolved_at IS NULL`).bind(now, person.id).run();
    }
    return;
  }

  if (!active) {
    await env.DB
      .prepare(
        `INSERT INTO mobile_alert_episodes (person_id, started_at, last_value_mgdl, last_trend, last_reading_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(person_id) DO UPDATE SET started_at = excluded.started_at, last_value_mgdl = excluded.last_value_mgdl,
           last_trend = excluded.last_trend, last_reading_at = excluded.last_reading_at, last_notified_at = NULL,
           acknowledged_at = NULL, acknowledged_by_admin_id = NULL, resolved_at = NULL`
      )
      .bind(person.id, now, value, trend, readingAt)
      .run();
  } else {
    await env.DB
      .prepare(`UPDATE mobile_alert_episodes SET last_value_mgdl = ?, last_trend = ?, last_reading_at = ? WHERE person_id = ?`)
      .bind(value, trend, readingAt, person.id)
      .run();
  }

  const current = await getActiveMobileAlert(env, person.id);
  if (!current || current.acknowledged_at) return;
  const lastNotified = await env.DB.prepare(`SELECT last_notified_at FROM mobile_alert_episodes WHERE person_id = ?`).bind(person.id).first<{ last_notified_at: number | null }>();
  if (lastNotified?.last_notified_at && now - lastNotified.last_notified_at < PUSH_REPEAT_SECONDS) return;

  await sendPushNotifications(env, person.customer_id, person.id, person.name, value, trend!);
  await env.DB.prepare(`UPDATE mobile_alert_episodes SET last_notified_at = ? WHERE person_id = ?`).bind(now, person.id).run();
}
