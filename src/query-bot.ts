import { verifyTwilioSignature } from "./lib/twilio-verify";
import { sendFreeformWhatsApp } from "./lib/whatsapp";
import { sendReportEmail } from "./report-email";
import { buildReadingsCsv, type ReadingCsvRow } from "./csv";
import { parseQueryIntent } from "./lib/query-intent";
import { generateBotChatReply, type FormattedEvent } from "./lib/bot-chat";
import { bucketByDayPeriod } from "./report-patterns";
import { detectGlucoseEvents } from "./report-events";
import { computeGlucoseStats } from "./report-stats";
import type { Env } from "./types";
import type { ThresholdBand } from "./lib/alerts";

const MAX_QUERIES_PER_PHONE_PER_DAY = 20;
const CODE_TTL_SECONDS = 10 * 60;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

interface QueryPerson extends ThresholdBand {
  id: string;
  name: string;
  timezone: string | null;
  report_email_address: string | null;
  subscriber_id: number;
  verified_at: number | null;
  verification_code: string | null;
  verification_code_sent_at: number | null;
}

function randomVerificationCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000));
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

function formatLocalTime(unixSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(unixSeconds * 1000));
}

function formatLocalDate(unixSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" }).format(new Date(unixSeconds * 1000));
}

/** Pre-formats event times in the person's local timezone -- never hand Claude a raw epoch to do date math on. */
function formatEventsForChat(readings: ReadingCsvRow[], thresholds: ThresholdBand, timezone: string, rangeDays: number): FormattedEvent[] {
  const events = detectGlucoseEvents(readings, thresholds);
  const maxEvents = rangeDays === 1 ? 8 : 5;
  return [...events]
    .sort((a, b) => b.extremeAt - a.extremeAt)
    .slice(0, maxEvents)
    .map((e) => ({
      direction: e.direction,
      extremeValue: e.extremeValue,
      when: rangeDays === 1 ? formatLocalTime(e.extremeAt, timezone) : `${formatLocalDate(e.extremeAt, timezone)} ${formatLocalTime(e.extremeAt, timezone)}`,
      durationMinutes: Math.round(e.durationSeconds / 60),
    }));
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
 * Authorization is data-driven via phone_subscribers -- a number only works
 * here if the account owner already added it in Settings, AND its holder
 * has completed a one-time "reply with this code" verification over this
 * same WhatsApp thread (see the verified_at check below). Outbound
 * alerting in poll.ts has no such gate and is unaffected by any of this.
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
              people.critical_low as critical_low, people.critical_high as critical_high,
              people.timezone as timezone, people.report_email_address as report_email_address,
              phone_subscribers.id as subscriber_id, phone_subscribers.verified_at as verified_at,
              phone_subscribers.verification_code as verification_code,
              phone_subscribers.verification_code_sent_at as verification_code_sent_at
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

  // Proves whoever is texting actually holds this phone, not just that an
  // account owner typed the number correctly -- see migration 0022. Doesn't
  // affect outbound alerting at all, only this interactive query path.
  if (!person.verified_at) {
    const codeStillValid =
      !!person.verification_code &&
      !!person.verification_code_sent_at &&
      now - person.verification_code_sent_at < CODE_TTL_SECONDS;

    if (codeStillValid && rawMessage === person.verification_code) {
      await env.DB
        .prepare(`UPDATE phone_subscribers SET verified_at = ?, verification_code = NULL WHERE id = ?`)
        .bind(now, person.subscriber_id)
        .run();
      await sendFreeformWhatsApp(from, "Verified. You can now text for glucose updates -- try \"summary\".", env).catch((err) =>
        console.error("handleWhatsAppInbound: verified-confirmation reply failed:", err)
      );
      return emptyTwiml();
    }

    if (!codeStillValid) {
      const code = randomVerificationCode();
      await env.DB
        .prepare(`UPDATE phone_subscribers SET verification_code = ?, verification_code_sent_at = ? WHERE id = ?`)
        .bind(code, now, person.subscriber_id)
        .run();
      await sendFreeformWhatsApp(
        from,
        `To protect ${person.name}'s data, reply with this code to verify this number: ${code} (expires in 10 min).`,
        env
      ).catch((err) => console.error("handleWhatsAppInbound: verification-code reply failed:", err));
    } else {
      await sendFreeformWhatsApp(
        from,
        "A verification code was already sent -- reply with that code, or wait for it to expire and text again.",
        env
      ).catch((err) => console.error("handleWhatsAppInbound: already-sent reply failed:", err));
    }
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
    .prepare(`SELECT value_mgdl, trend, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`)
    .bind(person.id, readingsSince)
    .all<ReadingCsvRow>();

  if (intent.metric === "email_report") {
    // Regex, not Claude, decides the destination address -- a wrong
    // destination is a real data-leak risk, not just a wording nitpick.
    const messageEmail = rawMessage.match(EMAIL_RE)?.[0] ?? null;
    const destination = messageEmail ?? person.report_email_address;

    if (!destination) {
      await sendFreeformWhatsApp(
        from,
        `Reply with: email report to you@example.com to get ${person.name}'s data by email.`,
        env
      ).catch((err) => console.error("handleWhatsAppInbound: email-prompt reply failed:", err));
      return emptyTwiml();
    }

    // First-time convenience only -- never silently overwrite an existing
    // Settings-configured address from a chat message.
    const isOneOffOverride = !!messageEmail && !!person.report_email_address && messageEmail !== person.report_email_address;
    if (messageEmail && !person.report_email_address) {
      await env.DB.prepare(`UPDATE people SET report_email_address = ? WHERE id = ?`).bind(messageEmail, person.id).run();
    }

    const stats = computeGlucoseStats(readings.results, person);
    const csv = buildReadingsCsv(readings.results, person.name, `${intent.range_days}d`);
    const label = rangeLabel(intent.range_days);

    try {
      await sendReportEmail(env, destination, person.name, "custom", readingsSince, now, person.timezone ?? "UTC", stats, csv);
      const note = isOneOffOverride ? " (one-off, your saved report email is unchanged)" : "";
      await sendFreeformWhatsApp(from, `Sending ${person.name}'s report (last ${label}) to ${destination} now${note}.`, env);
    } catch (err) {
      console.error(`handleWhatsAppInbound: report email failed for ${person.id} -> ${destination}:`, err);
      await sendFreeformWhatsApp(from, "Couldn't send the report right now -- try again shortly.", env).catch(() => {});
    }

    await env.DB
      .prepare(
        `INSERT INTO bot_queries (person_id, phone_number, raw_message, range_days, metric, responded_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(person.id, from, rawMessage.slice(0, 500), intent.range_days, intent.metric, now)
      .run();

    return emptyTwiml();
  }

  // Everything else is open-ended conversation, grounded in the same
  // computed data the old fixed templates used, phrased by Claude under
  // report-ai.ts's exact safety guardrail (see src/lib/bot-chat.ts) --
  // never a data source itself, never allowed to suggest a treatment.
  const timezone = person.timezone ?? "UTC";
  const stats = computeGlucoseStats(readings.results, person);
  const events = formatEventsForChat(readings.results, person, timezone, intent.range_days);
  const dayPeriodBuckets = bucketByDayPeriod(readings.results, timezone, person);

  const historyRows = await env.DB
    .prepare(
      `SELECT raw_message, bot_reply FROM bot_queries WHERE phone_number = ? AND bot_reply IS NOT NULL ORDER BY responded_at DESC LIMIT 6`
    )
    .bind(from)
    .all<{ raw_message: string; bot_reply: string }>();
  const history = historyRows.results
    .reverse()
    .flatMap((r) => [
      { role: "user" as const, content: r.raw_message },
      { role: "assistant" as const, content: r.bot_reply },
    ]);

  const { reply } = await generateBotChatReply(env, {
    personName: person.name,
    thresholds: person,
    rangeLabel: rangeLabel(intent.range_days),
    stats,
    events,
    dayPeriodBuckets,
    history,
    message: rawMessage,
  });

  try {
    await sendFreeformWhatsApp(from, reply, env);
  } catch (err) {
    console.error(`handleWhatsAppInbound: reply send failed for ${from}:`, err);
  }

  await env.DB
    .prepare(
      `INSERT INTO bot_queries (person_id, phone_number, raw_message, range_days, metric, responded_at, bot_reply) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(person.id, from, rawMessage.slice(0, 500), intent.range_days, intent.metric, now, reply)
    .run();

  return emptyTwiml();
}
