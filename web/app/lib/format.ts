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
    case "in_range":
      return "var(--status-green)";
    case "high":
      return "var(--status-red)";
    case "low":
      return "var(--status-orange)";
    case "stale":
    case "no_data":
      return "var(--status-gray)";
  }
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "in_range":
      return "In range";
    case "high":
      return "High";
    case "low":
      return "Low";
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
