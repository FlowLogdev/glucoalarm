import type { Env } from "../types";

// Every outbound Twilio send lands in message_log; Twilio's StatusCallback
// (POST /api/twilio/status, see src/twilio-status.ts) then updates it to
// sent/delivered/read/failed with the carrier error code. Never throws --
// logging a send must not break the send.

export type MessageChannel = "whatsapp" | "sms" | "voice";

export function statusCallbackUrl(env: Env): string {
  return `${env.PUBLIC_WORKER_URL}/api/twilio/status`;
}

export async function recordMessage(
  env: Env,
  m: { channel: MessageChannel; to: string; kind: string | null; sid: string | null; status: string; errorMessage?: string | null }
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO message_log (created_at, updated_at, channel, to_number, kind, twilio_sid, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(now, now, m.channel, m.to, m.kind?.slice(0, 120) ?? null, m.sid, m.status, m.errorMessage?.slice(0, 1000) ?? null)
      .run();
  } catch (err) {
    console.error("recordMessage failed:", err);
  }
}

export async function updateMessageStatus(
  env: Env,
  sid: string,
  status: string,
  errorCode: string | null,
  errorMessage: string | null
): Promise<void> {
  await env.DB
    .prepare(
      `UPDATE message_log SET status = ?, error_code = COALESCE(?, error_code), error_message = COALESCE(?, error_message), updated_at = ? WHERE twilio_sid = ?`
    )
    .bind(status, errorCode, errorMessage, Math.floor(Date.now() / 1000), sid)
    .run();
}
