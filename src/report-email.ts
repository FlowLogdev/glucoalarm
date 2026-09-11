import { sendEmail } from "./lib/resend";
import type { Env } from "./types";
import type { GlucoseStats } from "./report-stats";

function formatDate(epochSeconds: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", year: "numeric" }).format(
    new Date(epochSeconds * 1000)
  );
}

/**
 * Plain summary email, not a full report render -- the email links back
 * into the app for the full detail (charts, event list, AI discussion
 * points) rather than trying to reproduce that as HTML email markup.
 */
export async function sendReportEmail(
  env: Env,
  to: string,
  personName: string,
  reportType: "weekly" | "monthly" | "custom",
  periodStart: number,
  periodEnd: number,
  timezone: string,
  stats: GlucoseStats
): Promise<void> {
  const typeLabel = reportType === "weekly" ? "Weekly" : reportType === "monthly" ? "Monthly" : "Custom";
  const rangeLabel = `${formatDate(periodStart, timezone)} - ${formatDate(periodEnd, timezone)}`;

  const rows = [
    ["Average glucose", stats.mean != null ? `${stats.mean} mg/dL` : "N/A"],
    ["Estimated GMI", stats.gmi != null ? `${stats.gmi}%` : "Not enough data"],
    ["Time in range", stats.timeInRangePct != null ? `${stats.timeInRangePct}%` : "N/A"],
    ["Time above range", stats.timeAboveRangePct != null ? `${stats.timeAboveRangePct}%` : "N/A"],
    ["Time below range", stats.timeBelowRangePct != null ? `${stats.timeBelowRangePct}%` : "N/A"],
  ]
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;font-weight:600;">${value}</td></tr>`)
    .join("");

  await sendEmail(
    env,
    to,
    `Glucoalarm ${typeLabel} Report ready for ${personName}`,
    `<p>${personName}'s ${typeLabel.toLowerCase()} glucose report for ${rangeLabel} is ready.</p>
     <table>${rows}</table>
     <p>View the full report, including event details and AI discussion points, at
     <a href="https://glucoalarm.com/reports">glucoalarm.com/reports</a>.</p>
     <p style="color:#666;font-size:0.85em;">AI-generated insights included in the full report are for educational purposes only and are not medical advice.</p>`
  );
}
