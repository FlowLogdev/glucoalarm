export type AlertType =
  | "warn_low"
  | "critical_low"
  | "warn_high"
  | "critical_high"
  | "recovered"
  | "signal_lost"
  | "signal_restored"
  | "fast_drop_warning";

export type Tier = "safe" | "warn_low" | "critical_low" | "warn_high" | "critical_high";

export interface Person {
  id: string;
  name: string;
  safe_low: number;
  safe_high: number;
  critical_low: number;
  critical_high: number;
  stale_minutes: number;
}

const COOLDOWN_SECONDS: Record<AlertType, number> = {
  warn_low: 5 * 60,
  warn_high: 5 * 60,
  critical_low: 60,
  critical_high: 60,
  recovered: 0, // self-limiting: only fires on a tier transition, see classifyAlert
  signal_lost: 15 * 60,
  signal_restored: 0, // self-limiting: only fires on the signal_lost -> ok transition
  fast_drop_warning: 5 * 60,
};

// How close to safe_low (in mg/dL) a reading has to be, while still in the
// safe tier, before a fast drop there is worth an early heads-up -- e.g.
// DoubleDown at 280 mg/dL heading toward target range is good news, not a
// warning. 40 matches the "rapid change" threshold already used for the
// descriptive spike/drop pattern flags in report-events.ts.
const FAST_DROP_BUFFER_MGDL = 40;

/**
 * True when Dexcom's own rate-of-change flag ("falling_fast", Dexcom's
 * DoubleDown) shows up while still nominally safe but getting close to
 * safe_low -- gives a heads-up before the value actually crosses into
 * warn_low/critical_low, rather than waiting for the threshold breach
 * itself. Won't catch every fast drop (Dexcom's own trend algorithm can
 * lag a genuinely sudden crash by one reading), but catches the more
 * common case of a brisk-but-not-instant decline.
 */
export function shouldWarnFastDrop(person: ThresholdBand, value: number, trend: string): boolean {
  if (trend !== "falling_fast") return false;
  return value >= person.safe_low && value - person.safe_low <= FAST_DROP_BUFFER_MGDL;
}

export interface ThresholdBand {
  safe_low: number;
  safe_high: number;
  critical_low: number;
  critical_high: number;
}

export function classifyTier(person: ThresholdBand, value: number): Tier {
  if (value >= person.safe_low && value <= person.safe_high) return "safe";
  if (value < person.safe_low) {
    return value < person.critical_low ? "critical_low" : "warn_low";
  }
  return value > person.critical_high ? "critical_high" : "warn_high";
}

const NON_SAFE_ALERT_TYPES = new Set<AlertType>(["warn_low", "critical_low", "warn_high", "critical_high"]);

/**
 * `lastAlertType` is the most recent entry in alerts_log for this person
 * (excluding signal_lost, which is tracked independently). Returns the
 * alert to send this poll, or null if nothing should be sent.
 */
export function classifyAlert(
  person: Person,
  value: number,
  lastAlertType: AlertType | null
): AlertType | null {
  const tier = classifyTier(person, value);
  if (tier === "safe") {
    return lastAlertType && NON_SAFE_ALERT_TYPES.has(lastAlertType) ? "recovered" : null;
  }
  return tier;
}

// Past this age a reading says nothing about glucose right now (a fingerstick
// of 329 during an outage whose last reading was 90, 2026-11-09). Nothing may
// call, push or message about it as though it were current.
export const MAX_ACTIONABLE_READING_AGE_SECONDS = 15 * 60;

export function isReadingActionable(nowSeconds: number, recordedAt: number): boolean {
  return nowSeconds - recordedAt <= MAX_ACTIONABLE_READING_AGE_SECONDS;
}

export function isStale(nowSeconds: number, lastReceivedAt: number, staleMinutes: number): boolean {
  return nowSeconds - lastReceivedAt > staleMinutes * 60;
}

// people.low_call_acknowledged: an ack only silences its own severity or
// milder, so pressing 1 at 85 can't silence calls for a later drop to 49.
export const LOW_CALL_ACK_WARN = 1;
export const LOW_CALL_ACK_CRITICAL = 2;

export function isLowCallSilenced(acknowledged: number, tier: Tier): boolean {
  return acknowledged >= LOW_CALL_ACK_CRITICAL || (acknowledged === LOW_CALL_ACK_WARN && tier !== "critical_low");
}

// Cron runs aren't exactly 5 min apart -- a poll landing at 299s against a
// 300s cooldown skipped the 89 mg/dL low entirely on 2026-11-03.
export const CRON_JITTER_GRACE_SECONDS = 90;

export function isInCooldown(
  nowSeconds: number,
  alertType: AlertType,
  lastSameTypeAlertAt: number | null
): boolean {
  if (lastSameTypeAlertAt === null) return false;
  return nowSeconds - lastSameTypeAlertAt < COOLDOWN_SECONDS[alertType] - CRON_JITTER_GRACE_SECONDS;
}
