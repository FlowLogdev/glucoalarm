import { verifyTwilioSignature } from "./lib/twilio-verify";
import { updateMessageStatus } from "./lib/message-log";
import { logError } from "./ops";
import type { Env } from "./types";

const FAILED_STATUSES = new Set(["failed", "undelivered", "busy", "no-answer", "canceled"]);

/**
 * Twilio StatusCallback for every outbound message/call (set in
 * src/lib/whatsapp.ts and src/lib/voice.ts). Public by necessity, verified
 * by Twilio's request signature like /api/calls/ack. A failed delivery is
 * also written to error_log so the /admin diagnosis sees its error code
 * (e.g. 63016 outside the WhatsApp 24h window).
 */
export async function handleTwilioStatus(request: Request, env: Env): Promise<Response> {
  const params = Object.fromEntries(new URLSearchParams(await request.text()));
  const valid = await verifyTwilioSignature(env.TWILIO_AUTH, request.url, params, request.headers.get("X-Twilio-Signature"));
  if (!valid) {
    console.error("handleTwilioStatus: invalid Twilio signature");
    return new Response("forbidden", { status: 403 });
  }

  const sid = params.MessageSid ?? params.CallSid;
  const status = params.MessageStatus ?? params.CallStatus;
  if (!sid || !status) return new Response("ok");

  const errorCode = params.ErrorCode || null;
  const errorMessage = params.ErrorMessage || null;
  await updateMessageStatus(env, sid, status, errorCode, errorMessage);

  if (FAILED_STATUSES.has(status)) {
    const channel = params.CallSid ? "voice" : "whatsapp";
    await logError(env, channel, null, `Twilio ${channel} ${status} to ${params.To ?? "unknown"} (sid ${sid})${errorCode ? `, error ${errorCode}` : ""}${errorMessage ? `: ${errorMessage}` : ""}`);
  }
  return new Response("ok");
}
