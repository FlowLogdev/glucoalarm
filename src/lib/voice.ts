import type { Env } from "../types";

export class TwilioVoiceError extends Error {}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// This Twilio account is capped at 1 call at a time (CPS + concurrency) until
// its Business Profile is approved -- placing multiple calls back-to-back
// gets the later ones rejected with "Call concurrency limit exceeded." Ring
// timeout is capped explicitly (CALL_RING_TIMEOUT_SECONDS) and our own TwiML
// is bounded (one <Gather> plus at most two <Say> reads), so a call is never
// active much past CALL_ACTIVE_WINDOW_MS -- wait that long before returning
// so the next call in priority order doesn't collide. Deliberately not
// polling Twilio's Call resource for real status: Workers caps subrequests
// per invocation, and polling for 3 calls in a row blew through that limit.
const CALL_RING_TIMEOUT_SECONDS = 20;
const CALL_ACTIVE_WINDOW_MS = 30_000;

/**
 * Places a real phone call reading the alert aloud via Twilio's Voice API,
 * using inline TwiML (no separate webhook endpoint needed for the call
 * itself). Offers a <Gather> so the recipient can press 1 to acknowledge --
 * Twilio POSTs the keypress to `actionUrl` (see /api/calls/ack). If nobody
 * presses anything, falls through to repeating the message once more and
 * hanging up; the call itself doesn't retry -- pollPerson's 5-min repeat
 * cadence handles that on the next poll.
 */
export async function makeVoiceCall(to: string, message: string, actionUrl: string, env: Env): Promise<void> {
  if (env.MESSAGE_MODE !== "whatsapp") {
    console.log(`[Voice call stub] to=${to} message=${message} actionUrl=${actionUrl}`);
    return;
  }

  const say = `<Say voice="Polly.Joanna">${escapeXml(message)} Please acknowledge by pressing 1. If you press 1, you will not receive more calls for this low.</Say>`;
  const twiml =
    `<Response>` +
    `<Gather numDigits="1" timeout="10" action="${escapeXml(actionUrl)}" method="POST">${say}</Gather>` +
    say +
    `</Response>`;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.TWILIO_SID}:${env.TWILIO_AUTH}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: env.TWILIO_VOICE_FROM,
      Twiml: twiml,
      Timeout: String(CALL_RING_TIMEOUT_SECONDS),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new TwilioVoiceError(`Twilio call failed (${res.status}): ${text}`);
  }

  await new Promise((resolve) => setTimeout(resolve, CALL_ACTIVE_WINDOW_MS));
}

export function callMessageFor(name: string, value: number, time: string): string {
  return `This is an alert from Glucoalarm. ${name}'s glucose is low at ${value} milligrams per deciliter, recorded at ${time}.`;
}
