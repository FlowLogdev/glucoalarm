"use client";

import { useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  generateInsight,
  getInsight,
  getPeople,
  getReport,
  updateTimezone,
  type Insight,
  type Person,
  type Report,
  type ReportPeriod,
} from "../../lib/api";
import { formatDateTime, formatDuration, statusColor, statusLabel } from "../../lib/format";

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "biweek", label: "Bi-weekly" },
  { key: "month", label: "Monthly" },
];

const TIER_KEYS = ["critical_high", "warn_high", "safe", "warn_low", "critical_low"] as const;

function InsightCard({ personId, period }: { personId: string; period: ReportPeriod }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInsight(null);
    getInsight(personId, period)
      .then(setInsight)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [personId, period]);

  async function onGenerate() {
    setLoading(true);
    setError(null);
    try {
      setInsight(await generateInsight(personId, period));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate insight");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Time-of-day pattern</h3>
      {insight ? (
        <>
          <p>{insight.summary}</p>
          <p className="meta">Generated {formatDateTime(insight.generated_at)}</p>
        </>
      ) : (
        <p className="meta">No insight generated yet for this period.</p>
      )}
      <button onClick={onGenerate} disabled={loading}>
        {loading ? "Generating…" : insight ? "Regenerate" : "Generate insight"}
      </button>
      {error && <p className="meta">{error}</p>}
      <p className="meta" style={{ marginTop: "0.75rem" }}>
        AI-written pattern summary from readings only, not medical advice, and never a dosing
        suggestion.
      </p>
    </div>
  );
}

function PersonReport({ person, period }: { person: Person; period: ReportPeriod }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    getReport(person.id, period)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [person.id, period]);

  if (error) return <p className="meta">{error}</p>;
  if (!report) return <p className="meta">Loading…</p>;

  const pieData = TIER_KEYS.map((tier) => ({
    tier,
    label: statusLabel(tier),
    value: report.readingsByTier[tier],
  })).filter((d) => d.value > 0);

  return (
    <section>
      <h2>{person.name}</h2>
      <div className="card-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Readings by range</h3>
          {report.readingsByTier.total === 0 ? (
            <p className="meta">No readings in this period.</p>
          ) : (
            <>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.tier} fill={statusColor(d.tier)} stroke="var(--panel)" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#15181d", border: "1px solid #262b33", color: "#e8eaed" }}
                      formatter={(value: number) => [
                        `${value} (${Math.round((value / report.readingsByTier.total) * 100)}%)`,
                        "readings",
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: "0.85rem" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="meta">Based on {report.readingsByTier.total} captured readings.</p>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Spikes and lows</h3>
          {report.episodes.length === 0 ? (
            <p className="meta">No highs or lows outside the safe range this period.</p>
          ) : (
            report.episodes.map((ep, i) => (
              <div className="subscriber-row" key={i}>
                <span>
                  <strong style={{ color: ep.reachedCritical ? "var(--status-red)" : "var(--status-orange)" }}>
                    {ep.reachedCritical ? "CRITICAL " : ""}
                    {ep.direction === "low" ? "Low" : "High"}
                  </strong>{" "}
                  <span className="meta">
                    {ep.extremeValue} mg/dL{ep.ongoing ? " (ongoing)" : ""}
                  </span>
                  <br />
                  <span className="meta">
                    {formatDateTime(ep.startAt)} · {formatDuration(ep.endAt - ep.startAt)}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        <InsightCard personId={person.id} period={period} />
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("week");

  useEffect(() => {
    getPeople()
      .then(async (loaded) => {
        // Auto-detect this device's timezone for anyone who hasn't set one,
        // so time-of-day insights use real local hours instead of UTC.
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const missing = loaded.filter((p) => !p.timezone);
        if (detected && missing.length > 0) {
          await Promise.all(missing.map((p) => updateTimezone(p.id, detected).catch(() => {})));
          loaded = loaded.map((p) => (p.timezone ? p : { ...p, timezone: detected }));
        }
        setPeople(loaded);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (error) return <p className="meta">{error}</p>;
  if (!people) return <p className="meta">Loading…</p>;

  return (
    <>
      <h1>Reports</h1>
      <div className="range-toggle">
        {PERIODS.map((p) => (
          <button key={p.key} className={period === p.key ? "active" : ""} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {people.map((person) => (
        <PersonReport key={person.id} person={person} period={period} />
      ))}
    </>
  );
}
