import type { Env } from "./types";
import type { AlertType, Tier } from "./lib/alerts";

export const REPORT_PERIODS = { week: 168, biweek: 336, month: 720 } as const;
export type ReportPeriod = keyof typeof REPORT_PERIODS;

export interface ReadingsByTier {
  safe: number;
  warn_low: number;
  critical_low: number;
  warn_high: number;
  critical_high: number;
  total: number;
}

export interface Episode {
  direction: "low" | "high";
  reachedCritical: boolean;
  startAt: number;
  endAt: number;
  extremeValue: number;
  ongoing: boolean;
}

export interface Report {
  period: { key: ReportPeriod; label: string; startAt: number; endAt: number };
  readingsByTier: ReadingsByTier;
  episodes: Episode[];
}

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  week: "Weekly",
  biweek: "Bi-weekly",
  month: "Monthly",
};

const DIRECTION: Partial<Record<AlertType, "low" | "high">> = {
  warn_low: "low",
  critical_low: "low",
  warn_high: "high",
  critical_high: "high",
};

/**
 * Groups consecutive same-direction alerts_log rows into episodes, closed
 * by a "recovered" entry, a direction switch, or the end of the period.
 * This mirrors the tier logic in src/lib/alerts.ts — an episode starts the
 * moment a reading first leaves the safe range and ends when it returns.
 */
export function buildEpisodes(
  rows: { type: AlertType; value_mgdl: number | null; sent_at: number }[],
  periodEnd: number
): Episode[] {
  const episodes: Episode[] = [];
  let current: Episode | null = null;

  for (const row of rows) {
    const direction = DIRECTION[row.type];

    if (!direction) {
      // "recovered" or "signal_lost" closes whatever episode was open.
      if (current) {
        current.endAt = row.sent_at;
        current.ongoing = false;
        current = null;
      }
      continue;
    }

    if (current && current.direction === direction) {
      current.endAt = row.sent_at;
      if (row.value_mgdl != null) {
        current.extremeValue =
          direction === "low"
            ? Math.min(current.extremeValue, row.value_mgdl)
            : Math.max(current.extremeValue, row.value_mgdl);
      }
      current.reachedCritical ||= row.type.startsWith("critical");
      continue;
    }

    if (current) {
      // Direction flipped without an explicit "recovered" row in between.
      current.endAt = row.sent_at;
      current.ongoing = false;
    }

    current = {
      direction,
      reachedCritical: row.type.startsWith("critical"),
      startAt: row.sent_at,
      endAt: row.sent_at,
      extremeValue: row.value_mgdl ?? 0,
      ongoing: true,
    };
    episodes.push(current);
  }

  if (current) current.endAt = Math.max(current.endAt, periodEnd);

  return episodes.reverse(); // most recent first
}

export async function getReport(env: Env, personId: string, periodKey: ReportPeriod, now: number): Promise<Report | null> {
  const person = await env.DB.prepare(`SELECT id FROM people WHERE id = ?`).bind(personId).first();
  if (!person) return null;

  const hours = REPORT_PERIODS[periodKey];
  const startAt = now - hours * 3600;

  const tierRows = await env.DB
    .prepare(
      `SELECT
         CASE
           WHEN r.value_mgdl >= p.safe_low AND r.value_mgdl <= p.safe_high THEN 'safe'
           WHEN r.value_mgdl < p.safe_low AND r.value_mgdl < p.critical_low THEN 'critical_low'
           WHEN r.value_mgdl < p.safe_low THEN 'warn_low'
           WHEN r.value_mgdl > p.critical_high THEN 'critical_high'
           ELSE 'warn_high'
         END AS tier,
         COUNT(*) AS count
       FROM readings r JOIN people p ON p.id = r.person_id
       WHERE r.person_id = ? AND r.recorded_at >= ?
       GROUP BY tier`
    )
    .bind(personId, startAt)
    .all<{ tier: Tier; count: number }>();

  const readingsByTier: ReadingsByTier = {
    safe: 0,
    warn_low: 0,
    critical_low: 0,
    warn_high: 0,
    critical_high: 0,
    total: 0,
  };
  for (const row of tierRows.results) {
    readingsByTier[row.tier] = row.count;
    readingsByTier.total += row.count;
  }

  const alertRows = await env.DB
    .prepare(
      `SELECT type, value_mgdl, sent_at FROM alerts_log
       WHERE person_id = ? AND sent_at >= ? AND type != 'signal_lost'
       ORDER BY sent_at ASC`
    )
    .bind(personId, startAt)
    .all<{ type: AlertType; value_mgdl: number | null; sent_at: number }>();

  const episodes = buildEpisodes(alertRows.results, now).slice(0, 100);

  return {
    period: { key: periodKey, label: PERIOD_LABELS[periodKey], startAt, endAt: now },
    readingsByTier,
    episodes,
  };
}
