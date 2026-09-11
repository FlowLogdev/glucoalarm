import type { Env } from "./types";

export const A1C_WINDOWS = [
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 168 },
  { key: "14d", label: "Last 2 weeks", hours: 336 },
  { key: "30d", label: "Last 30 days", hours: 720 },
  { key: "90d", label: "Last 90 days", hours: 2160 },
] as const;

// Below this many readings in a window, the average is too noisy to show as
// an estimate (e.g. a person who just connected Dexcom yesterday shouldn't
// see a fake-precise "90-day A1C" built from two readings).
const MIN_READINGS_FOR_ESTIMATE = 24;

export interface A1CEstimate {
  key: string;
  label: string;
  averageMgdl: number | null;
  estimatedA1c: number | null;
  readingCount: number;
}

/**
 * The GMI formula itself, factored out so report-stats.ts (weekly/monthly
 * reports, arbitrary custom periods) can reuse it instead of re-deriving
 * the constant -- same formula, same rounding, byte-identical output to
 * what this file already computed inline.
 */
export function gmiFromAverage(avgMgdl: number): number {
  return Math.round((3.31 + 0.02392 * avgMgdl) * 10) / 10;
}

/**
 * Estimates A1C from average CGM glucose using the Glucose Management
 * Indicator (GMI) formula -- GMI(%) = 3.31 + 0.02392 * mean_glucose_mgdl
 * (Bergenstal et al., 2018, Diabetes Care). This is the CGM-specific
 * estimate; it deliberately does NOT use the older ADAG eA1C formula
 * (avg + 46.7) / 28.7, which was derived from fingerstick data and reads
 * differently for CGM-derived averages. Matches what Dexcom Clarity itself
 * reports. Plain arithmetic on real readings, not AI-generated, not a lab
 * result -- always labeled as an estimate.
 */
export async function getA1CEstimates(env: Env, personId: string, now: number): Promise<A1CEstimate[] | null> {
  const person = await env.DB.prepare(`SELECT id FROM people WHERE id = ?`).bind(personId).first();
  if (!person) return null;

  const results: A1CEstimate[] = [];
  for (const window of A1C_WINDOWS) {
    const startAt = now - window.hours * 3600;
    const row = await env.DB
      .prepare(`SELECT AVG(value_mgdl) as avg_mgdl, COUNT(*) as n FROM readings WHERE person_id = ? AND recorded_at >= ?`)
      .bind(personId, startAt)
      .first<{ avg_mgdl: number | null; n: number }>();

    const avg = row?.avg_mgdl ?? null;
    const count = row?.n ?? 0;
    const hasEnough = avg != null && count >= MIN_READINGS_FOR_ESTIMATE;

    results.push({
      key: window.key,
      label: window.label,
      averageMgdl: hasEnough ? Math.round(avg) : null,
      estimatedA1c: hasEnough ? gmiFromAverage(avg) : null,
      readingCount: count,
    });
  }

  return results;
}
