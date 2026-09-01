export type AlertType = "high" | "low" | "signal_lost" | "recovered";

export interface Person {
  id: string;
  name: string;
  low_threshold: number;
  high_threshold: number;
  stale_minutes: number;
}

const COOLDOWN_SECONDS = 15 * 60;

export function classifyReading(
  person: Person,
  value: number,
  lastAlertType: AlertType | null
): AlertType | null {
  if (value <= person.low_threshold) return "low";
  if (value >= person.high_threshold) return "high";
  if (lastAlertType === "high" || lastAlertType === "low") return "recovered";
  return null;
}

export function isStale(nowSeconds: number, lastReceivedAt: number, staleMinutes: number): boolean {
  return nowSeconds - lastReceivedAt > staleMinutes * 60;
}

export function isInCooldown(nowSeconds: number, lastSameTypeAlertAt: number | null): boolean {
  if (lastSameTypeAlertAt === null) return false;
  return nowSeconds - lastSameTypeAlertAt < COOLDOWN_SECONDS;
}
