"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  addA1CRecord,
  generateCustomGlucoseReport,
  getA1CEstimates,
  getA1CRecords,
  getCurrentAdmin,
  getGlucoseReport,
  getPeople,
  getReport,
  removeA1CRecord,
  updateTimezone,
  type A1CEstimate,
  type A1CRecord,
  type CurrentAdmin,
  type GlucoseReport,
  type Person,
  type Report,
  type ReportPeriod,
} from "../../lib/api";
import { formatDateTime, formatDuration, statusColor, statusLabel } from "../../lib/format";
import { InsightCard } from "../../lib/InsightCard";
import { GlucoalarmBot } from "../../lib/GlucoalarmBot";

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "biweek", label: "Bi-weekly" },
  { key: "month", label: "Monthly" },
];

const TIER_KEYS = ["critical_high", "warn_high", "safe", "warn_low", "critical_low"] as const;

function A1CCard({ person }: { person: Person }) {
  const [estimates, setEstimates] = useState<A1CEstimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getA1CEstimates(person.id)
      .then(setEstimates)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [person.id]);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Estimated A1C</h3>
      {error && <p className="meta">{error}</p>}
      {!error && !estimates && <p className="meta">Loading…</p>}
      {estimates && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {estimates.map((e) => (
              <div
                key={e.key}
                style={{
                  flex: "1 1 90px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0.6rem 0.5rem",
                  textAlign: "center",
                }}
              >
                <div className="meta" style={{ marginBottom: "0.25rem" }}>
                  {e.label}
                </div>
                {e.estimatedA1c != null ? (
                  <>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{e.estimatedA1c}%</div>
                    <div className="meta">avg {e.averageMgdl} mg/dL</div>
                  </>
                ) : (
                  <div className="meta">Not enough data</div>
                )}
              </div>
            ))}
          </div>
          <p className="meta" style={{ marginTop: "0.75rem" }}>
            Calculated from {person.name}&apos;s own CGM readings using the Glucose Management
            Indicator (GMI) formula. This is an estimate, not a lab A1C test, and should be
            confirmed with a real lab result before making care decisions.
          </p>
        </>
      )}
    </div>
  );
}

const DAY_PERIOD_LABELS: Record<string, string> = {
  overnight: "Overnight",
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

const COMPARISON_LABELS: Record<string, string> = {
  average_glucose: "Average glucose",
  estimated_gmi: "Estimated GMI",
  time_in_range: "Time in range",
  time_above_range: "Time above range",
  time_below_range: "Time below range",
  variability: "Variability",
};

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ReportDetail({ report }: { report: GlucoseReport }) {
  return (
    <>
      <p className="meta">
        {formatDate(report.period_start)} – {formatDate(report.period_end)}
      </p>

      {report.data_coverage.isLimited && (
        <p className="meta">Limited glucose data is available for this reporting period. Some trends may be less reliable.</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.6rem", margin: "0.75rem 0" }}>
        {[
          ["Readings", report.metrics.readingCount],
          ["Average", report.metrics.mean != null ? `${report.metrics.mean} mg/dL` : "—"],
          ["Median", report.metrics.median != null ? `${report.metrics.median} mg/dL` : "—"],
          ["Min / Max", report.metrics.min != null ? `${report.metrics.min} / ${report.metrics.max}` : "—"],
          ["Std. deviation", report.metrics.stdev ?? "—"],
          ["Estimated GMI", report.metrics.gmi != null ? `${report.metrics.gmi}%` : "Not enough data"],
          ["Time in range", report.metrics.timeInRangePct != null ? `${report.metrics.timeInRangePct}%` : "—"],
          ["Time above range", report.metrics.timeAboveRangePct != null ? `${report.metrics.timeAboveRangePct}%` : "—"],
          ["Time below range", report.metrics.timeBelowRangePct != null ? `${report.metrics.timeBelowRangePct}%` : "—"],
          ["Data coverage", `${report.data_coverage.coveragePct}%`],
        ].map(([label, value]) => (
          <div key={label as string} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem", textAlign: "center" }}>
            <div className="meta" style={{ marginBottom: "0.2rem" }}>
              {label}
            </div>
            <div style={{ fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {report.patterns && (
        <>
          <h4 style={{ marginBottom: "0.4rem" }}>By time of day</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            {report.patterns.dayPeriodBuckets.map((b) => (
              <div key={b.period} style={{ flex: "1 1 100px", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem", textAlign: "center" }}>
                <div className="meta">{DAY_PERIOD_LABELS[b.period] ?? b.period}</div>
                <div style={{ fontWeight: 700 }}>{b.timeInRangePct != null ? `${b.timeInRangePct}% in range` : "No data"}</div>
              </div>
            ))}
          </div>

          <p className="meta">
            {report.patterns.highEventCount} high event{report.patterns.highEventCount === 1 ? "" : "s"} and{" "}
            {report.patterns.lowEventCount} low event{report.patterns.lowEventCount === 1 ? "" : "s"} detected this period.
          </p>

          {report.patterns.comparison && (
            <>
              <h4 style={{ marginBottom: "0.4rem" }}>Compared to the previous period</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginBottom: "1rem" }}>
                {report.patterns.comparison
                  .filter((c) => c.current != null && c.previous != null)
                  .map((c) => (
                    <div key={c.metric} className="subscriber-row">
                      <span>{COMPARISON_LABELS[c.metric] ?? c.metric}</span>
                      <span className="meta">
                        {c.current} (was {c.previous}), {c.difference != null && c.difference > 0 ? "+" : ""}
                        {c.difference}
                        {c.unit === "percentage_points" ? " pts" : ""}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </>
      )}

      {report.ai_analysis && (
        <>
          <h4 style={{ marginBottom: "0.4rem" }}>AI summary</h4>
          {report.status === "ai_pending" ? (
            <p className="meta">AI insights are temporarily unavailable for this report.</p>
          ) : (
            <>
              <p>{report.ai_analysis.summary}</p>
              {report.ai_analysis.positive_patterns.length > 0 && (
                <>
                  <p className="meta" style={{ marginBottom: "0.2rem" }}>
                    Positive patterns
                  </p>
                  <ul>
                    {report.ai_analysis.positive_patterns.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {report.ai_analysis.patterns_to_watch.length > 0 && (
                <>
                  <p className="meta" style={{ marginBottom: "0.2rem" }}>
                    Patterns to watch
                  </p>
                  <ul>
                    {report.ai_analysis.patterns_to_watch.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {report.ai_analysis.discussion_points.length > 0 && (
                <>
                  <h4 style={{ marginBottom: "0.4rem" }}>Discuss with your doctor</h4>
                  <ul>
                    {report.ai_analysis.discussion_points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                    {report.ai_analysis.questions_for_doctor.map((p, i) => (
                      <li key={`q-${i}`}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="meta" style={{ marginTop: "0.75rem" }}>
                {report.ai_analysis.disclaimer}
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}

function GlucoseReportSection({ person }: { person: Person }) {
  const [type, setType] = useState<"weekly" | "monthly">("weekly");
  const [report, setReport] = useState<GlucoseReport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(undefined);
    getGlucoseReport(person.id, type)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [person.id, type]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ margin: 0 }}>Automatic glucose report</h3>
        <div className="range-toggle" style={{ margin: 0 }}>
          <button className={type === "weekly" ? "active" : ""} onClick={() => setType("weekly")}>
            Weekly
          </button>
          <button className={type === "monthly" ? "active" : ""} onClick={() => setType("monthly")}>
            Monthly
          </button>
        </div>
      </div>

      {error && <p className="meta">{error}</p>}
      {report === undefined && !error && <p className="meta">Loading…</p>}
      {report === null && (
        <p className="meta">
          No {type} report has been generated yet. Reports are created automatically at the end of
          each completed {type === "weekly" ? "week" : "calendar month"}.
        </p>
      )}
      {report && <ReportDetail report={report} />}
    </div>
  );
}

const MS_PER_DAY = 86400;

function CustomReportCard({ person, readOnly }: { person: Person; readOnly: boolean }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState<GlucoseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const periodStart = Math.floor(new Date(startDate).getTime() / 1000);
      const periodEnd = Math.floor(new Date(endDate).getTime() / 1000) + MS_PER_DAY;
      if (periodEnd <= periodStart) throw new Error("End date must be after start date");
      if ((periodEnd - periodStart) / MS_PER_DAY > 366) throw new Error("Range cannot exceed 12 months");
      const result = await generateCustomGlucoseReport(person.id, periodStart, periodEnd);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Custom range report</h3>
      <p className="meta">Generate a report for any date range up to 12 months.</p>
      {!readOnly && (
        <form onSubmit={onGenerate}>
          <div className="card-grid" style={{ gap: "0.75rem" }}>
            <label>
              Start date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label>
              End date
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>
          </div>
          <button type="submit" disabled={loading}>
            {loading ? "Generating..." : "Generate report"}
          </button>
        </form>
      )}
      {error && <p className="meta">{error}</p>}
      {report && (
        <div style={{ marginTop: "1rem" }}>
          <ReportDetail report={report} />
        </div>
      )}
    </div>
  );
}

function LabA1CCard({ person, readOnly }: { person: Person; readOnly: boolean }) {
  const [records, setRecords] = useState<A1CRecord[] | null>(null);
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getA1CRecords(person.id)
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, [person.id]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const measuredAt = Math.floor(new Date(date).getTime() / 1000);
      await addA1CRecord(person.id, Number(value), measuredAt, source);
      setValue("");
      setDate("");
      setSource("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    }
  }

  async function onRemove(id: number) {
    setError(null);
    try {
      await removeA1CRecord(person.id, id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Laboratory A1C</h3>
      <p className="meta">
        Real lab results, entered manually. Kept separate from the estimated GMI above -- lab A1C
        is never replaced by a CGM-based estimate.
      </p>
      {records?.map((r) => (
        <div className="subscriber-row" key={r.id}>
          <span>
            <strong>{r.a1c_value}%</strong> <span className="meta">measured {formatDate(r.measured_at)}{r.source ? ` · ${r.source}` : ""}</span>
          </span>
          {!readOnly && (
            <button className="danger" onClick={() => onRemove(r.id)}>
              Remove
            </button>
          )}
        </div>
      ))}
      {records?.length === 0 && <p className="meta">No lab results recorded yet.</p>}

      {!readOnly && (
        <form onSubmit={onAdd} style={{ marginTop: "1rem" }}>
          <div className="card-grid" style={{ gap: "0.75rem" }}>
            <label>
              A1C value (%)
              <input type="number" step="0.1" min="0" max="20" value={value} onChange={(e) => setValue(e.target.value)} required />
            </label>
            <label>
              Date measured
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>
          <label>
            Source (optional)
            <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Quest Diagnostics" />
          </label>
          <button type="submit">Add lab result</button>
        </form>
      )}
      {error && <p className="meta">{error}</p>}
    </div>
  );
}

function PersonReport({ person, period, readOnly }: { person: Person; period: ReportPeriod; readOnly: boolean }) {
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>{person.name}</h2>
        <a className="history-link" href={`/api/proxy/reports/csv?person_id=${encodeURIComponent(person.id)}&period=${period}`} download>
          Download CSV →
        </a>
      </div>
      <div className="card-grid" style={{ marginBottom: "1rem" }}>
        <A1CCard person={person} />
      </div>
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

      <div className="card-grid" style={{ marginTop: "1rem" }}>
        <GlucoseReportSection person={person} />
        <CustomReportCard person={person} readOnly={readOnly} />
        <LabA1CCard person={person} readOnly={readOnly} />
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);

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
  useEffect(() => {
    getCurrentAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  if (error) return <p className="meta">{error}</p>;
  if (!people) return <p className="meta">Loading…</p>;

  const readOnly = admin?.role === "doctor";

  return (
    <div className="settings-layout">
      <div>
        <h1>Reports</h1>
        <div className="range-toggle">
          {PERIODS.map((p) => (
            <button key={p.key} className={period === p.key ? "active" : ""} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {people.map((person) => (
          <PersonReport key={person.id} person={person} period={period} readOnly={readOnly} />
        ))}
      </div>
      <GlucoalarmBot subtitle="Ask about your reports" />
    </div>
  );
}
