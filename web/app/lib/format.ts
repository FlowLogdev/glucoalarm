import type { Status } from "./api";

export function trendArrow(trend: string | null | undefined): string {
  switch (trend) {
    case "rising_fast":
      return "⇈";
    case "rising":
      return "↑";
    case "flat":
      return "→";
    case "falling":
      return "↓";
    case "falling_fast":
      return "⇊";
    default:
      return "—";
  }
}

export function statusColor(status: Status): string {
  switch (status) {
    case "safe":
      return "var(--status-green)";
    case "critical_low":
    case "critical_high":
      return "var(--status-red)";
    case "warn_low":
    case "warn_high":
      return "var(--status-orange)";
    case "stale":
    case "no_data":
      return "var(--status-gray)";
  }
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "safe":
      return "In safe range";
    case "warn_low":
      return "Low";
    case "critical_low":
      return "CRITICAL LOW";
    case "warn_high":
      return "High";
    case "critical_high":
      return "CRITICAL HIGH";
    case "stale":
      return "Signal lost";
    case "no_data":
      return "No data yet";
  }
}

export function minutesAgo(unixSeconds: number, nowSeconds: number): string {
  const minutes = Math.max(0, Math.round((nowSeconds - unixSeconds) / 60));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
