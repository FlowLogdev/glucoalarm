import { classifyTier, type ThresholdBand } from "./lib/alerts";
import type { ReadingRow } from "./report-stats";

export interface GlucoseEvent {
  direction: "high" | "low";
  startAt: number;
  endAt: number;
  durationSeconds: number;
  startValue: number;
  endValue: number;
  extremeValue: number; // peak for high, lowest for low
  extremeAt: number;
}

/**
 * Reading-level event grouping, distinct from reports.ts's buildEpisodes()
 * (which groups alerts_log rows -- cooldown-driven, coarser). This walks
 * raw readings so an event carries the exact starting/ending/peak values
 * the report spec asks for. Consecutive out-of-range readings of the same
 * direction collapse into one event; a single in-range reading closes it.
 */
export function detectGlucoseEvents(readings: ReadingRow[], thresholds: ThresholdBand): GlucoseEvent[] {
  const sorted = [...readings].sort((a, b) => a.recorded_at - b.recorded_at);
  const events: GlucoseEvent[] = [];
  let current: GlucoseEvent | null = null;

  for (const r of sorted) {
    const tier = classifyTier(thresholds, r.value_mgdl);
    const direction: "high" | "low" | null =
      tier === "warn_high" || tier === "critical_high" ? "high" : tier === "warn_low" || tier === "critical_low" ? "low" : null;

    if (!direction) {
      current = null;
      continue;
    }

    if (current && current.direction === direction) {
      current.endAt = r.recorded_at;
      current.endValue = r.value_mgdl;
      const isMoreExtreme = direction === "high" ? r.value_mgdl > current.extremeValue : r.value_mgdl < current.extremeValue;
      if (isMoreExtreme) {
        current.extremeValue = r.value_mgdl;
        current.extremeAt = r.recorded_at;
      }
      continue;
    }

    current = {
      direction,
      startAt: r.recorded_at,
      endAt: r.recorded_at,
      durationSeconds: 0,
      startValue: r.value_mgdl,
      endValue: r.value_mgdl,
      extremeValue: r.value_mgdl,
      extremeAt: r.recorded_at,
    };
    events.push(current);
  }

  for (const e of events) e.durationSeconds = e.endAt - e.startAt;
  return events;
}

export interface RateOfChangeFlag {
  direction: "increase" | "decrease";
  hour: number; // local hour, 0-23
  occurrences: number;
}

// A change of >=40 mg/dL between two Dexcom-cadence (~5 min) readings is a
// clearly abnormal rate of change worth surfacing -- well above normal
// meal/exercise drift, comfortably below noise/sensor-glitch territory.
const RAPID_CHANGE_THRESHOLD_MGDL = 40;
const MIN_RECURRENCES_TO_REPORT = 2;

/**
 * Descriptive only, per the spec's explicit GOOD/BAD example: flags
 * *when* rapid changes recur, never *why*. No meal/activity correlation
 * unless that data actually exists in this app (it doesn't yet), so this
 * never claims a cause.
 */
export function detectRateOfChangePatterns(readings: ReadingRow[], timezone: string): RateOfChangeFlag[] {
  const sorted = [...readings].sort((a, b) => a.recorded_at - b.recorded_at);
  const increaseHours = new Array(24).fill(0);
  const decreaseHours = new Array(24).fill(0);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false });

  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i].value_mgdl - sorted[i - 1].value_mgdl;
    if (Math.abs(delta) < RAPID_CHANGE_THRESHOLD_MGDL) continue;
    const hour = Number(formatter.format(new Date(sorted[i].recorded_at * 1000))) % 24;
    if (delta > 0) increaseHours[hour]++;
    else decreaseHours[hour]++;
  }

  const flags: RateOfChangeFlag[] = [];
  increaseHours.forEach((count, hour) => {
    if (count >= MIN_RECURRENCES_TO_REPORT) flags.push({ direction: "increase", hour, occurrences: count });
  });
  decreaseHours.forEach((count, hour) => {
    if (count >= MIN_RECURRENCES_TO_REPORT) flags.push({ direction: "decrease", hour, occurrences: count });
  });

  return flags.sort((a, b) => b.occurrences - a.occurrences);
}
