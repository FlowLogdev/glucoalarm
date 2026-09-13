import { REPORT_PERIODS, type ReportPeriod } from "./reports";
import type { Env } from "./types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export interface ReadingCsvRow {
  value_mgdl: number;
  trend: string | null;
  recorded_at: number;
}

/**
 * Plain CSV of readings.value_mgdl/trend/recorded_at, raw data only, no
 * interpretation or calculation added here. Shared by the authenticated web
 * download route (getReportCsv below) and the WhatsApp bot's email-a-report
 * path (query-bot.ts), so both produce byte-identical output from one
 * implementation.
 */
export function buildReadingsCsv(readings: ReadingCsvRow[], personName: string, filenameSuffix: string): { filename: string; content: string } {
  const rows = ["Date,Time,Glucose (mg/dL),Trend"];
  for (const r of readings) {
    const d = new Date(r.recorded_at * 1000);
    rows.push(
      [
        csvEscape(d.toISOString().slice(0, 10)),
        csvEscape(d.toISOString().slice(11, 19)),
        String(r.value_mgdl),
        csvEscape(r.trend ?? ""),
      ].join(",")
    );
  }

  const filename = `glucoalarm-${personName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${filenameSuffix}.csv`;
  return { filename, content: rows.join("\n") };
}

export async function getReportCsv(env: Env, personId: string, periodKey: ReportPeriod, now: number): Promise<Response | null> {
  const person = await env.DB.prepare(`SELECT name FROM people WHERE id = ?`).bind(personId).first<{ name: string }>();
  if (!person) return null;

  const hours = REPORT_PERIODS[periodKey];
  const startAt = now - hours * 3600;

  const readings = await env.DB
    .prepare(`SELECT value_mgdl, trend, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`)
    .bind(personId, startAt)
    .all<ReadingCsvRow>();

  const { filename, content } = buildReadingsCsv(readings.results, person.name, periodKey);

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
