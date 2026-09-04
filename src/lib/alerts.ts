export type AlertType =
  | "warn_low"
  | "critical_low"
  | "warn_high"
  | "critical_high"
  | "recovered"
  | "signal_lost";

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
};

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

export function isStale(nowSeconds: number, lastReceivedAt: number, staleMinutes: number): boolean {
  return nowSeconds - lastReceivedAt > staleMinutes * 60;
}

export function isInCooldown(
  nowSeconds: number,
  alertType: AlertType,
  lastSameTypeAlertAt: number | null
): boolean {
  if (lastSameTypeAlertAt === null) return false;
  return nowSeconds - lastSameTypeAlertAt < COOLDOWN_SECONDS[alertType];
}
