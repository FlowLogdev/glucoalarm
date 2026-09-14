export interface SubscriberSchedule {
  active_start_minute: number | null;
  active_end_minute: number | null;
  active_days: string | null; // comma-separated 0(Sun)-6(Sat)
}

/**
 * Pure function, same shape as classifyTier/isStale in lib/alerts.ts. Both
 * minute fields null means always active -- the default for every
 * subscriber added before this feature existed, and for anyone who just
 * doesn't want a schedule. Only gates outbound pushes (alerts, ticker,
 * calls) -- the WhatsApp/voice bots are never gated by this, a caregiver
 * can always ask for information whenever they want it.
 */
export function isSubscriberActiveNow(subscriber: SubscriberSchedule, timezone: string, nowSeconds: number): boolean {
  if (subscriber.active_start_minute == null && subscriber.active_end_minute == null) return true;

  const now = new Date(nowSeconds * 1000);
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dayFormatter.format(now));

  if (subscriber.active_days) {
    const allowedDays = subscriber.active_days.split(",").map((d) => Number(d.trim()));
    if (!allowedDays.includes(dayIndex)) return false;
  }

  const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false });
  const parts = timeFormatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMinuteOfDay = hour * 60 + minute;

  const start = subscriber.active_start_minute ?? 0;
  const end = subscriber.active_end_minute ?? 24 * 60;

  // Supports an overnight window (e.g. 22:00-06:00) where start > end.
  if (start <= end) {
    return nowMinuteOfDay >= start && nowMinuteOfDay < end;
  }
  return nowMinuteOfDay >= start || nowMinuteOfDay < end;
}
