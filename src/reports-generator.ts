import type { Env } from "./types";
import { computeGlucoseStats, computeDataCoverage, type ReadingRow } from "./report-stats";
import { detectGlucoseEvents, detectRateOfChangePatterns } from "./report-events";
import { bucketByDayPeriod, findBestWorstDays, compareStats } from "./report-patterns";
import { generateAIReportAnalysis } from "./report-ai";
import { sendWhatsApp, billingAlertVariables } from "./lib/whatsapp";

export interface ReportPerson {
  id: string;
  name: string;
  timezone: string | null;
  safe_low: number;
  safe_high: number;
  critical_low: number;
  critical_high: number;
}

function localTimeParts(epochSeconds: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(new Date(epochSeconds * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"),
  };
}

/** UTC epoch of local midnight on the same calendar day as referenceEpoch, in the given timezone. */
function localMidnightEpoch(referenceEpoch: number, timezone: string): number {
  const p = localTimeParts(referenceEpoch, timezone);
  const secondsSinceMidnight = p.hour * 3600 + p.minute * 60 + p.second;
  return referenceEpoch - secondsSinceMidnight;
}

export interface DuePeriod {
  reportType: "weekly" | "monthly";
  periodStart: number;
  periodEnd: number;
}

/**
 * Runs once daily (separate cron from the 5-min Dexcom poll, see
 * wrangler.toml). Weeks start Monday (ISO week) -- stated explicitly since
 * there's no existing convention to match. A period is "due" the day it
 * closes: local Monday means the ISO week that just ended is complete;
 * local day-of-month 1 means the previous calendar month just ended.
 * Known approximation: the weekly periodStart (`todayMidnight - 7*86400`)
 * can be off by up to an hour across a DST transition week, and the
 * monthly anchor uses UTC noon of day 1 to sidestep date-line edge cases
 * in extreme timezones -- both acceptable given this only decides which
 * calendar period a report covers, not any alerting-critical timing.
 */
export function determineDuePeriods(now: number, timezone: string): DuePeriod[] {
  const due: DuePeriod[] = [];
  const today = localTimeParts(now, timezone);
  const todayMidnight = localMidnightEpoch(now, timezone);

  if (today.weekday === "Mon") {
    due.push({ reportType: "weekly", periodStart: todayMidnight - 7 * 86400, periodEnd: todayMidnight });
  }

  if (today.day === 1) {
    const prevMonth = today.month === 1 ? 12 : today.month - 1;
    const prevYear = today.month === 1 ? today.year - 1 : today.year;
    const anchorUtcNoon = Date.UTC(prevYear, prevMonth - 1, 1, 12, 0, 0) / 1000;
    const periodStart = localMidnightEpoch(anchorUtcNoon, timezone);
    due.push({ reportType: "monthly", periodStart, periodEnd: todayMidnight });
  }

  return due;
}

async function fetchReadings(env: Env, personId: string, start: number, end: number): Promise<ReadingRow[]> {
  const rows = await env.DB
    .prepare(`SELECT value_mgdl, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at ASC`)
    .bind(personId, start, end)
    .all<ReadingRow>();
  return rows.results;
}

/**
 * Generates and persists one report. Idempotent via the UNIQUE index on
 * (person_id, report_type, period_start, period_end) -- INSERT ... ON
 * CONFLICT DO NOTHING, so a duplicate cron tick or a manual re-trigger is
 * a safe no-op (meta.changes === 0), not a duplicate row or duplicate
 * notification.
 */
export async function generateReport(
  env: Env,
  person: ReportPerson,
  reportType: "weekly" | "monthly",
  periodStart: number,
  periodEnd: number,
  now: number
): Promise<{ created: boolean }> {
  const timezone = person.timezone ?? "UTC";
  const thresholds = person;

  const readings = await fetchReadings(env, person.id, periodStart, periodEnd);
  const stats = computeGlucoseStats(readings, thresholds);
  const dataCoverage = computeDataCoverage(readings, periodStart, periodEnd);
  const events = detectGlucoseEvents(readings, thresholds);
  const rateOfChangeFlags = detectRateOfChangePatterns(readings, timezone);
  const dayPeriodBuckets = bucketByDayPeriod(readings, timezone, thresholds);
  const bestWorstDays = findBestWorstDays(readings, timezone, thresholds);

  const prevDuration = periodEnd - periodStart;
  const prevReadings = await fetchReadings(env, person.id, periodStart - prevDuration, periodStart);
  const prevStats = prevReadings.length > 0 ? computeGlucoseStats(prevReadings, thresholds) : null;
  const comparison = prevStats ? compareStats(stats, prevStats) : null;

  const { analysis, ok: aiOk } = await generateAIReportAnalysis(env, {
    personFirstName: person.name.split(" ")[0] || person.name,
    reportType,
    stats,
    dataCoverage,
    events,
    rateOfChangeFlags,
    dayPeriodBuckets,
    bestWorstDays,
    comparison,
  });

  const highEventCount = events.filter((e) => e.direction === "high").length;
  const lowEventCount = events.filter((e) => e.direction === "low").length;
  const patterns = { dayPeriodBuckets, bestWorstDays, comparison, rateOfChangeFlags, highEventCount, lowEventCount, events: events.slice(0, 50) };

  const result = await env.DB
    .prepare(
      `INSERT INTO glucose_reports (person_id, report_type, period_start, period_end, metrics, patterns, ai_analysis, data_coverage, status, generated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (person_id, report_type, period_start, period_end) DO NOTHING`
    )
    .bind(
      person.id,
      reportType,
      periodStart,
      periodEnd,
      JSON.stringify(stats),
      JSON.stringify(patterns),
      JSON.stringify(analysis),
      JSON.stringify(dataCoverage),
      aiOk ? "complete" : "ai_pending",
      now,
      now
    )
    .run();

  if (result.meta.changes === 0) return { created: false };

  // Best-effort notification -- reuses the same approved WhatsApp template
  // pattern as the billing-lapse alert (src/stripe-webhook.ts). A send
  // failure here must never undo the report that was just saved.
  try {
    const subscribers = await env.DB
      .prepare(`SELECT phone_number FROM phone_subscribers WHERE person_id = ?`)
      .bind(person.id)
      .all<{ phone_number: string }>();
    const label = reportType === "weekly" ? "📊 WEEKLY REPORT READY" : "📊 MONTHLY REPORT READY";
    const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
      new Date(now * 1000)
    );
    const variables = billingAlertVariables(person.name, label, time);
    for (const sub of subscribers.results) {
      try {
        await sendWhatsApp(sub.phone_number, variables, env);
      } catch (err) {
        console.error(`generateReport: notify failed for ${person.id} -> ${sub.phone_number}:`, err);
      }
    }
  } catch (err) {
    console.error(`generateReport: notification step failed for ${person.id}:`, err);
  }

  return { created: true };
}

/**
 * Fully separate from pollAll()'s 5-min Dexcom-polling path -- driven by
 * its own daily cron entry (see wrangler.toml), never called from the
 * every-5-minutes schedule. An O(people) scan (small table), never a
 * readings table scan, per the D1-quota lesson from migrations/0008.
 */
export async function checkAndGenerateReports(env: Env, now: number): Promise<void> {
  const people = await env.DB
    .prepare(
      `SELECT people.id, people.name, people.timezone, people.safe_low, people.safe_high, people.critical_low, people.critical_high
       FROM people JOIN customers ON customers.id = people.customer_id WHERE customers.subscription_status = 'active'`
    )
    .all<ReportPerson>();

  for (const person of people.results) {
    try {
      const timezone = person.timezone ?? "UTC";
      const due = determineDuePeriods(now, timezone);
      for (const period of due) {
        await generateReport(env, person, period.reportType, period.periodStart, period.periodEnd, now);
      }
    } catch (err) {
      console.error(`checkAndGenerateReports failed for ${person.id}:`, err);
    }
  }
}
