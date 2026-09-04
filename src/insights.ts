import { classifyTier } from "./lib/alerts";
import { REPORT_PERIODS, type ReportPeriod } from "./reports";
import type { Env } from "./types";

interface PersonForInsights {
  id: string;
  name: string;
  safe_low: number;
  safe_high: number;
  critical_low: number;
  critical_high: number;
  timezone: string | null;
}

interface HourBucket {
  hour: number;
  count: number;
}

interface PatternStats {
  personName: string;
  periodLabel: string;
  totalReadings: number;
  lowHours: HourBucket[]; // top 3 non-zero hours for warn_low + critical_low, local time
  highHours: HourBucket[]; // top 3 non-zero hours for warn_high + critical_high, local time
  lowCount: number;
  highCount: number;
  safeCount: number;
}

function localHour(unixSeconds: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const hourStr = formatter.format(new Date(unixSeconds * 1000));
  // "24" shows up for midnight in some locales/ICU versions with hour12:false.
  const hour = Number(hourStr) % 24;
  return hour;
}

function topHours(counts: number[], take = 3): HourBucket[] {
  return counts
    .map((count, hour) => ({ hour, count }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, take);
}

async function computeStats(
  env: Env,
  person: PersonForInsights,
  periodKey: ReportPeriod,
  now: number
): Promise<PatternStats> {
  const hours = REPORT_PERIODS[periodKey];
  const startAt = now - hours * 3600;
  const timezone = person.timezone ?? "UTC";

  const readings = await env.DB
    .prepare(`SELECT value_mgdl, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ?`)
    .bind(person.id, startAt)
    .all<{ value_mgdl: number; recorded_at: number }>();

  const lowCounts = new Array(24).fill(0);
  const highCounts = new Array(24).fill(0);
  let safeCount = 0;

  for (const r of readings.results) {
    const tier = classifyTier(person, r.value_mgdl);
    if (tier === "safe") {
      safeCount++;
      continue;
    }
    const hour = localHour(r.recorded_at, timezone);
    if (tier === "warn_low" || tier === "critical_low") lowCounts[hour]++;
    else highCounts[hour]++;
  }

  const lowCount = lowCounts.reduce((a, b) => a + b, 0);
  const highCount = highCounts.reduce((a, b) => a + b, 0);

  return {
    personName: person.name,
    periodLabel: periodKey,
    totalReadings: readings.results.length,
    lowHours: topHours(lowCounts),
    highHours: topHours(highCounts),
    lowCount,
    highCount,
    safeCount,
  };
}

const SYSTEM_PROMPT = `You summarize aggregated glucose-monitoring statistics for a home care app. You will receive counts only — never raw readings, never any medical record.

Write 2-4 short sentences describing any time-of-day pattern in the data (e.g. lows clustering in early morning hours), plus, if relevant, one question the reader could bring to their endocrinologist. If the data shows no clear pattern, say that plainly instead of inventing one.

Strict rules, no exceptions:
- Never mention or imply an insulin dose, unit amount, medication, or any treatment action.
- Never use the words "inject", "dose", "units", "insulin", "take", "administer".
- Only describe what is present in the provided counts. Do not speculate about causes (food, exercise, stress) unless asked.
- Plain, warm, factual tone. No bullet points, no headers, no markdown.`;

const BANNED_PATTERN = /\b(inject|dose|dosing|units?\b.*insulin|insulin\b.*units?|administer|take \d)/i;

function buildUserMessage(stats: PatternStats): string {
  return JSON.stringify({
    person: stats.personName,
    period: stats.periodLabel,
    total_readings: stats.totalReadings,
    readings_in_safe_range: stats.safeCount,
    readings_low: stats.lowCount,
    readings_high: stats.highCount,
    top_hours_for_lows_local_time: stats.lowHours.map((h) => `${h.hour}:00 (${h.count}x)`),
    top_hours_for_highs_local_time: stats.highHours.map((h) => `${h.hour}:00 (${h.count}x)`),
  });
}

const FALLBACK_SUMMARY =
  "This summary couldn't be generated safely and was replaced with this message. Try regenerating, or review the Reports page numbers directly.";

async function callAnthropic(env: Env, stats: PatternStats): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 300,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(stats) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${text}`);
  }

  const data = await res.json<{ content: { type: string; text?: string }[] }>();
  const text = data.content.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new Error("Anthropic response had no text content");

  if (BANNED_PATTERN.test(text)) {
    console.error("Insight response failed the dosing-language guardrail, replaced with fallback:", text);
    return FALLBACK_SUMMARY;
  }

  return text;
}

export interface Insight {
  summary: string;
  generated_at: number;
}

export async function getCachedInsight(env: Env, personId: string, period: ReportPeriod): Promise<Insight | null> {
  return env.DB
    .prepare(`SELECT summary, generated_at FROM insights WHERE person_id = ? AND period = ?`)
    .bind(personId, period)
    .first<Insight>();
}

export async function generateInsight(
  env: Env,
  person: PersonForInsights,
  period: ReportPeriod,
  now: number
): Promise<Insight> {
  const stats = await computeStats(env, person, period, now);
  const summary = await callAnthropic(env, stats);

  await env.DB
    .prepare(
      `INSERT INTO insights (person_id, period, generated_at, summary) VALUES (?, ?, ?, ?)
       ON CONFLICT (person_id, period) DO UPDATE SET generated_at = excluded.generated_at, summary = excluded.summary`
    )
    .bind(person.id, period, now, summary)
    .run();

  return { summary, generated_at: now };
}
