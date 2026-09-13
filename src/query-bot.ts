import { verifyTwilioSignature } from "./lib/twilio-verify";
import { sendFreeformWhatsApp } from "./lib/whatsapp";
import { parseQueryIntent } from "./lib/query-intent";
import { computeGlucoseStats, type ReadingRow } from "./report-stats";
import type { Env } from "./types";
import type { ThresholdBand } from "./lib/alerts";

const MAX_QUERIES_PER_PHONE_PER_DAY = 20;

interface QueryPerson extends ThresholdBand {
  id: string;
  name: string;
}

function emptyTwiml(): Response {
  return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
}

function rangeLabel(days: number): string {
  switch (days) {
    case 1:
      return "24 hours";
    default:
      return `${days} days`;
  }
}

function buildReply(person: QueryPerson, metric: "summary" | "a1c" | "time_in_range", rangeDays: number, stats: ReturnType<typeof computeGlucoseStats>): string {
  const label = rangeLabel(rangeDays);
  if (stats.readingCount === 0) {
    return `No Dexcom readings found for ${person.name} in the last ${label}.`;
  }

  const gmiText = stats.gmi !== null ? `${stats.gmi}%` : "not enough data yet for a reliable estimate";

  switch (metric) {
    case "a1c":
      return `${person.name}'s estimated A1C (GMI) over the last ${label}: ${gmiText}, based on ${stats.readingCount} readings.`;
    case "time_in_range":
      return `${person.name} was in range (${person.safe_low}-${person.safe_high} mg/dL) ${stats.timeInRangePct}% of the last ${label} (${stats.timeAboveRangePct}% high, ${stats.timeBelowRangePct}% low).`;
    case "summary":
    default:
      return `${person.name}'s last ${label}: avg ${stats.mean} mg/dL, est. A1C (GMI) ${gmiText}, ${stats.timeInRangePct}% in range (${person.safe_low}-${person.safe_high} mg/dL). Based on ${stats.readingCount} readings.`;
  }
}

/**
 * Twilio POSTs here for every inbound WhatsApp message to the shared
 * Glucoalarm number. Public/unauthenticated by necessity -- Twilio can't
 * send our admin bearer token -- verified via Twilio's own signature
 * scheme instead, same as calls-webhook.ts. Always returns 200 with empty
 * TwiML immediately after acknowledging; the actual reply is sent
 * separately via the Twilio REST API (sendFreeformWhatsApp) so a slow
 * Claude/D1 call never risks Twilio's webhook timeout.
 *
 * Authorization is entirely data-driven via phone_subscribers -- there is
 * no separate self-serve verification step. A phone number only works
 * here if the account owner already added it in Settings, the same trust
 * level the existing outbound alerting has always relied on.
 */
export async function handleWhatsAppInbound(request: Request, env: Env, now: number): Promise<Response> {
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const signature = request.headers.get("X-Twilio-Signature");

  const valid = await verifyTwilioSignature(env.TWILIO_AUTH, request.url, params, signature);
  if (!valid) {
    console.error("handleWhatsAppInbound: invalid Twilio signature");
    return new Response("invalid signature", { status: 403 });
  }

  const from = (params["From"] ?? "").replace(/^whatsapp:/, "");
  const rawMessage = (params["Body"] ?? "").trim();
  if (!from || !rawMessage) return emptyTwiml();

  const person = await env.DB
    .prepare(
      `SELECT people.id as id, people.name as name, people.safe_low as safe_low, people.safe_high as safe_high,
              people.critical_low as critical_low, people.critical_high as critical_high
       FROM phone_subscribers
       JOIN people ON people.id = phone_subscribers.person_id
       JOIN customers ON customers.id = people.customer_id
       WHERE phone_subscribers.phone_number = ? AND customers.subscription_status = 'active'
       LIMIT 1`
    )
    .bind(from)
    .first<QueryPerson>();

  if (!person) {
    await sendFreeformWhatsApp(
      from,
      "This number isn't set up to receive Glucoalarm updates. Sign up or check your billing at glucoalarm.com.",
      env
    ).catch((err) => console.error("handleWhatsAppInbound: not-found reply failed:", err));
    return emptyTwiml();
  }

  const since = now - 24 * 60 * 60;
  const recentCount = await env.DB
    .prepare(`SELECT COUNT(*) as n FROM bot_queries WHERE phone_number = ? AND responded_at >= ?`)
    .bind(from, since)
    .first<{ n: number }>();
  if ((recentCount?.n ?? 0) >= MAX_QUERIES_PER_PHONE_PER_DAY) {
    await sendFreeformWhatsApp(from, "You've hit today's query limit for this number. Try again tomorrow.", env).catch((err) =>
      console.error("handleWhatsAppInbound: rate-limit reply failed:", err)
    );
    return emptyTwiml();
  }

  const intent = await parseQueryIntent(env, rawMessage);

  const readingsSince = now - intent.range_days * 24 * 60 * 60;
  const readings = await env.DB
    .prepare(`SELECT value_mgdl, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`)
    .bind(person.id, readingsSince)
    .all<ReadingRow>();

  const stats = computeGlucoseStats(readings.results, person);
  const reply = buildReply(person, intent.metric, intent.range_days, stats);

  try {
    await sendFreeformWhatsApp(from, reply, env);
  } catch (err) {
    console.error(`handleWhatsAppInbound: reply send failed for ${from}:`, err);
  }

  await env.DB
    .prepare(
      `INSERT INTO bot_queries (person_id, phone_number, raw_message, range_days, metric, responded_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(person.id, from, rawMessage.slice(0, 500), intent.range_days, intent.metric, now)
    .run();

  return emptyTwiml();
}
