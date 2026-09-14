import { verifyTwilioSignature } from "./lib/twilio-verify";
import { escapeXml } from "./lib/voice";
import { computeGlucoseStats } from "./report-stats";
import { detectGlucoseEvents } from "./report-events";
import { formatLocalTime } from "./lib/time-format";
import type { Env } from "./types";
import type { ThresholdBand } from "./lib/alerts";

interface VoicePerson extends ThresholdBand {
  id: string;
  name: string;
  timezone: string | null;
  verified_at: number | null;
}

function twiml(inner: string): Response {
  return new Response(`<Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function say(text: string): string {
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say>`;
}

/**
 * Twilio POSTs here both when a call first comes in (no Digits param) and
 * again when the <Gather> below collects a keypress (Digits present) --
 * same URL for both, same pattern as calls-webhook.ts's <Gather> handling.
 * Public/unauthenticated by necessity, verified via Twilio's own signature
 * scheme. Authorization mirrors the WhatsApp bot exactly: caller must be a
 * verified phone_subscribers number (see migration 0022) or they just hear
 * a "not recognized" message -- a wrong number can't call in and hear real
 * data any more than it could text for it. English only for v1 -- TTS
 * language-switching is a separate follow-up.
 */
export async function handleVoiceInbound(request: Request, env: Env, now: number): Promise<Response> {
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const signature = request.headers.get("X-Twilio-Signature");

  const valid = await verifyTwilioSignature(env.TWILIO_AUTH, request.url, params, signature);
  if (!valid) {
    console.error("handleVoiceInbound: invalid Twilio signature");
    return new Response("invalid signature", { status: 403 });
  }

  const from = params["From"] ?? "";
  const digits = params["Digits"];

  const person = await env.DB
    .prepare(
      `SELECT people.id as id, people.name as name, people.safe_low as safe_low, people.safe_high as safe_high,
              people.critical_low as critical_low, people.critical_high as critical_high,
              people.timezone as timezone, phone_subscribers.verified_at as verified_at
       FROM phone_subscribers
       JOIN people ON people.id = phone_subscribers.person_id
       JOIN customers ON customers.id = people.customer_id
       WHERE phone_subscribers.phone_number = ? AND customers.subscription_status = 'active'
       LIMIT 1`
    )
    .bind(from)
    .first<VoicePerson>();

  if (!person || !person.verified_at) {
    return twiml(say("This number isn't recognized by Glucoalarm. Goodbye.") + "<Hangup/>");
  }

  const actionUrl = `${env.PUBLIC_WORKER_URL}/api/voice/inbound`;
  const menu =
    `<Gather numDigits="1" timeout="10" action="${escapeXml(actionUrl)}" method="POST">` +
    say(`Hi, this is Glucoalarm. For ${person.name}'s summary today, press 1. For recent lows and highs, press 2.`) +
    `</Gather>` +
    say("No input received. Goodbye.");

  if (!digits) {
    return twiml(menu);
  }

  const timezone = person.timezone ?? "UTC";
  const since = now - 24 * 60 * 60;
  const readings = await env.DB
    .prepare(`SELECT value_mgdl, trend, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`)
    .bind(person.id, since)
    .all<{ value_mgdl: number; trend: string | null; recorded_at: number }>();

  if (digits === "1") {
    const stats = computeGlucoseStats(readings.results, person);
    if (stats.readingCount === 0) {
      return twiml(say(`No Dexcom readings found for ${person.name} in the last 24 hours. Goodbye.`));
    }
    const gmiText = stats.gmi !== null ? `${stats.gmi} percent` : "not available -- not enough data yet";
    return twiml(
      say(
        `${person.name}'s average glucose today is ${stats.mean} milligrams per deciliter. Estimated A1C is ${gmiText}. Time in range is ${stats.timeInRangePct} percent. Goodbye.`
      )
    );
  }

  if (digits === "2") {
    const events = detectGlucoseEvents(readings.results, person);
    if (events.length === 0) {
      return twiml(say(`No lows or highs recorded for ${person.name} in the last 24 hours. Goodbye.`));
    }
    const recent = [...events].sort((a, b) => b.extremeAt - a.extremeAt).slice(0, 3);
    const parts = recent.map(
      (e) => `${e.direction === "low" ? "Low" : "High"} of ${e.extremeValue} at ${formatLocalTime(e.extremeAt, timezone)}`
    );
    return twiml(say(`${person.name}'s recent events: ${parts.join(". ")}. Goodbye.`));
  }

  return twiml(say("Sorry, that wasn't a valid option. Goodbye."));
}
