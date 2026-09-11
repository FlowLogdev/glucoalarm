import { classifyTier, type ThresholdBand } from "./lib/alerts";
import { gmiFromAverage } from "./a1c";

export interface ReadingRow {
  value_mgdl: number;
  recorded_at: number;
}

// Centralized data-sufficiency policy for the report system (separate
// constant from a1c.ts's own dashboard-widget threshold -- that file's
// behavior is untouched; this is the new system's single source of truth,
// per the "don't scatter arbitrary thresholds" instruction).
export const MIN_READINGS_FOR_RELIABLE_REPORT = 24;
export const DEXCOM_EXPECTED_INTERVAL_SECONDS = 5 * 60;

export interface GlucoseStats {
  readingCount: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
  gmi: number | null;
  timeInRangePct: number | null;
  timeAboveRangePct: number | null;
  timeBelowRangePct: number | null;
}

export interface DataCoverage {
  readingCount: number;
  daysWithData: number;
  expectedReadings: number;
  coveragePct: number;
  isLimited: boolean;
  gmiReliable: boolean;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Pure, deterministic -- no DB or AI calls. Reused by weekly and monthly report generation alike. */
export function computeGlucoseStats(readings: ReadingRow[], thresholds: ThresholdBand): GlucoseStats {
  if (readings.length === 0) {
    return {
      readingCount: 0,
      mean: null,
      median: null,
      min: null,
      max: null,
      stdev: null,
      gmi: null,
      timeInRangePct: null,
      timeAboveRangePct: null,
      timeBelowRangePct: null,
    };
  }

  const values = readings.map((r) => r.value_mgdl);
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  let inRange = 0;
  let above = 0;
  let below = 0;
  for (const v of values) {
    const tier = classifyTier(thresholds, v);
    if (tier === "safe") inRange++;
    else if (tier === "warn_low" || tier === "critical_low") below++;
    else above++;
  }

  const total = values.length;
  const hasEnoughForGmi = total >= MIN_READINGS_FOR_RELIABLE_REPORT;

  return {
    readingCount: total,
    mean: Math.round(mean),
    median: Math.round(median(sorted)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdev: Math.round(stdev(values, mean) * 10) / 10,
    gmi: hasEnoughForGmi ? gmiFromAverage(mean) : null,
    timeInRangePct: Math.round((inRange / total) * 1000) / 10,
    timeAboveRangePct: Math.round((above / total) * 1000) / 10,
    timeBelowRangePct: Math.round((below / total) * 1000) / 10,
  };
}

/**
 * Data completeness for the period. "Expected readings" assumes Dexcom's
 * own ~5-min reporting cadence -- this is an approximation (real-world
 * gaps happen for reasons outside the app's control), never treated as a
 * hard guarantee, only a rough coverage indicator per the spec's
 * "do not interpret missing readings as normal glucose readings" rule.
 */
export function computeDataCoverage(readings: ReadingRow[], periodStart: number, periodEnd: number): DataCoverage {
  const readingCount = readings.length;
  const daysWithData = new Set(readings.map((r) => Math.floor(r.recorded_at / 86400))).size;
  const durationSeconds = Math.max(0, periodEnd - periodStart);
  const expectedReadings = Math.max(1, Math.round(durationSeconds / DEXCOM_EXPECTED_INTERVAL_SECONDS));
  const coveragePct = Math.round(Math.min(1, readingCount / expectedReadings) * 1000) / 10;

  return {
    readingCount,
    daysWithData,
    expectedReadings,
    coveragePct,
    isLimited: readingCount < MIN_READINGS_FOR_RELIABLE_REPORT,
    gmiReliable: readingCount >= MIN_READINGS_FOR_RELIABLE_REPORT,
  };
}
