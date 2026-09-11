import type { ThresholdBand } from "./lib/alerts";
import { computeGlucoseStats, type GlucoseStats, type ReadingRow } from "./report-stats";

export type DayPeriod = "overnight" | "morning" | "midday" | "afternoon" | "evening";

const PERIOD_BOUNDS: { key: DayPeriod; startHour: number; endHour: number }[] = [
  { key: "overnight", startHour: 0, endHour: 6 },
  { key: "morning", startHour: 6, endHour: 10 },
  { key: "midday", startHour: 10, endHour: 14 },
  { key: "afternoon", startHour: 14, endHour: 18 },
  { key: "evening", startHour: 18, endHour: 24 },
];

function localHour(unixSeconds: number, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false });
  return Number(formatter.format(new Date(unixSeconds * 1000))) % 24;
}

function dayPeriodForHour(hour: number): DayPeriod {
  return PERIOD_BOUNDS.find((p) => hour >= p.startHour && hour < p.endHour)?.key ?? "evening";
}

export interface DayPeriodBucket {
  period: DayPeriod;
  readingCount: number;
  timeInRangePct: number | null;
  timeLowPct: number | null;
  timeHighPct: number | null;
  meanGlucose: number | null;
}

/** Groups readings into 5 named day-periods (reused everywhere else this app buckets by time of day would use hour-of-day directly -- this file introduces the named-bucket grouping the report spec asks for). */
export function bucketByDayPeriod(readings: ReadingRow[], timezone: string, thresholds: ThresholdBand): DayPeriodBucket[] {
  const buckets = new Map<DayPeriod, ReadingRow[]>();
  for (const p of PERIOD_BOUNDS) buckets.set(p.key, []);

  for (const r of readings) {
    const period = dayPeriodForHour(localHour(r.recorded_at, timezone));
    buckets.get(period)!.push(r);
  }

  return PERIOD_BOUNDS.map((p) => {
    const items = buckets.get(p.key)!;
    if (items.length === 0) {
      return { period: p.key, readingCount: 0, timeInRangePct: null, timeLowPct: null, timeHighPct: null, meanGlucose: null };
    }
    const stats = computeGlucoseStats(items, thresholds);
    return {
      period: p.key,
      readingCount: items.length,
      timeInRangePct: stats.timeInRangePct,
      timeLowPct: stats.timeBelowRangePct,
      timeHighPct: stats.timeAboveRangePct,
      meanGlucose: stats.mean,
    };
  });
}

export interface DaySummary {
  date: string; // YYYY-MM-DD in the person's local timezone
  timeInRangePct: number | null;
  meanGlucose: number | null;
  stdev: number | null;
}

export interface BestWorstDays {
  bestTimeInRange: DaySummary | null;
  worstTimeInRange: DaySummary | null;
  highestAverage: DaySummary | null;
  lowestAverage: DaySummary | null;
  mostVariable: DaySummary | null;
}

/** Neutral terminology only -- "best/worst Time in Range" is a factual ranking, not a medical judgment about the day itself. */
export function findBestWorstDays(readings: ReadingRow[], timezone: string, thresholds: ThresholdBand): BestWorstDays {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const byDate = new Map<string, ReadingRow[]>();

  for (const r of readings) {
    const date = dateFormatter.format(new Date(r.recorded_at * 1000));
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(r);
  }

  const days: DaySummary[] = Array.from(byDate.entries())
    .map(([date, items]) => {
      const stats = computeGlucoseStats(items, thresholds);
      return { date, timeInRangePct: stats.timeInRangePct, meanGlucose: stats.mean, stdev: stats.stdev };
    })
    .filter((d) => d.timeInRangePct !== null);

  if (days.length === 0) {
    return { bestTimeInRange: null, worstTimeInRange: null, highestAverage: null, lowestAverage: null, mostVariable: null };
  }

  const by = (key: keyof DaySummary, pick: "max" | "min") =>
    days.reduce((best, d) => {
      const bestVal = best[key] as number;
      const val = d[key] as number;
      return pick === "max" ? (val > bestVal ? d : best) : val < bestVal ? d : best;
    });

  return {
    bestTimeInRange: by("timeInRangePct", "max"),
    worstTimeInRange: by("timeInRangePct", "min"),
    highestAverage: by("meanGlucose", "max"),
    lowestAverage: by("meanGlucose", "min"),
    mostVariable: by("stdev", "max"),
  };
}

export interface PeriodComparison {
  metric: string;
  current: number | null;
  previous: number | null;
  difference: number | null;
  percentChange: number | null; // null when a plain percentage-point difference is more appropriate (e.g. GMI, TIR)
  unit: "percentage_points" | "value";
}

/** current/previous are already-computed stats for two equal-length adjacent periods. Pure diffing, no DB access. */
export function compareStats(current: GlucoseStats, previous: GlucoseStats): PeriodComparison[] {
  const diff = (key: keyof GlucoseStats, label: string, unit: PeriodComparison["unit"]): PeriodComparison => {
    const c = current[key] as number | null;
    const p = previous[key] as number | null;
    const difference = c != null && p != null ? Math.round((c - p) * 10) / 10 : null;
    const percentChange = unit === "value" && c != null && p != null && p !== 0 ? Math.round(((c - p) / p) * 1000) / 10 : null;
    return { metric: label, current: c, previous: p, difference, percentChange, unit };
  };

  return [
    diff("mean", "average_glucose", "value"),
    diff("gmi", "estimated_gmi", "percentage_points"),
    diff("timeInRangePct", "time_in_range", "percentage_points"),
    diff("timeAboveRangePct", "time_above_range", "percentage_points"),
    diff("timeBelowRangePct", "time_below_range", "percentage_points"),
    diff("stdev", "variability", "value"),
  ];
}
