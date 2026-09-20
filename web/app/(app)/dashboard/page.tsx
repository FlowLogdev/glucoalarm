"use client";

import { useEffect, useState } from "react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  getA1CEstimates,
  getHistory,
  getPeople,
  getLatestReading,
  getReport,
  getTickets,
  type A1CEstimate,
  type LatestReadingResponse,
  type Person,
  type Report,
  type SupportTicket,
} from "../../lib/api";
import { trendArrow, statusColor, statusLabel, minutesAgo } from "../../lib/format";

const TIER_KEYS = ["critical_high", "warn_high", "safe", "warn_low", "critical_low"] as const;

const POLL_INTERVAL_MS = 30_000;

function statusVar(color: string): React.CSSProperties {
  return { "--status": color } as React.CSSProperties;
}

function PersonCard({ person }: { person: Person }) {
  const [data, setData] = useState<LatestReadingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await getLatestReading(person.id);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [person.id]);

  if (error) {
    return (
      <div className="card person-card" style={statusVar("var(--status-gray)")}>
        <div className="name">
          <a href={`/history/${person.id}`}>{person.name}</a>
        </div>
        <p className="meta">Couldn&apos;t reach the API: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card person-card" style={statusVar("var(--status-gray)")}>
        <div className="name">
          <a href={`/history/${person.id}`}>{person.name}</a>
        </div>
        <p className="meta">Loading…</p>
      </div>
    );
  }

  const { reading, status, now } = data;

  return (
    <div className="card person-card" style={statusVar(statusColor(status))}>
      <div className="name">
        <a href={`/history/${person.id}`}>{person.name}</a>
        <span className="status-dot" />
      </div>
      {reading ? (
        <>
          <div className="value-row">
            <span className="value">{reading.value_mgdl}</span>
            <span className="trend">{trendArrow(reading.trend)}</span>
            <span>mg/dL</span>
          </div>
          <div className="status-label">{statusLabel(status)}</div>
          <div className="meta">
            last updated {minutesAgo(reading.recorded_at, now)}
          </div>
        </>
      ) : (
        <div className="status-label">{statusLabel(status)}</div>
      )}
      <a className="history-link" href={`/history/${person.id}`}>
        View history →
      </a>
    </div>
  );
}

function TrendChartCard({ person }: { person: Person }) {
  const [data, setData] = useState<{ time: number; value: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHistory(person.id, 24)
      .then((readings) => setData(readings.map((r) => ({ time: r.recorded_at * 1000, value: r.value_mgdl }))))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [person.id]);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{person.name}&apos;s trend (24h)</h3>
      {error && <p className="meta">{error}</p>}
      {!error && !data && <p className="meta">Loading…</p>}
      {data && data.length === 0 && <p className="meta">No readings in the last 24 hours.</p>}
      {data && data.length > 0 && (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric" })}
                stroke="var(--text-dim)"
                fontSize={11}
              />
              <YAxis stroke="var(--text-dim)" fontSize={11} width={36} />
              <Tooltip
                contentStyle={{ background: "#15181d", border: "1px solid #262b33", color: "#e8eaed" }}
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => [`${v} mg/dL`, "Glucose"]}
              />
              <Line type="monotone" dataKey="value" stroke="var(--status-green)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <a className="history-link" href={`/history/${person.id}`}>
        Full history →
      </a>
    </div>
  );
}

function TierPieCard({ person }: { person: Person }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReport(person.id, "week")
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [person.id]);

  if (error) return <div className="card"><p className="meta">{error}</p></div>;
  if (!report) return <div className="card"><p className="meta">Loading…</p></div>;

  const pieData = TIER_KEYS.map((tier) => ({
    tier,
    label: statusLabel(tier),
    value: report.readingsByTier[tier],
  })).filter((d) => d.value > 0);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{person.name}&apos;s week at a glance</h3>
      {report.readingsByTier.total === 0 ? (
        <p className="meta">No readings this week.</p>
      ) : (
        <>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="label" innerRadius={40} outerRadius={75} paddingAngle={2}>
                  {pieData.map((d) => (
                    <Cell key={d.tier} fill={statusColor(d.tier)} stroke="var(--panel)" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#15181d", border: "1px solid #262b33", color: "#e8eaed" }}
                  formatter={(value: number) => [`${value} (${Math.round((value / report.readingsByTier.total) * 100)}%)`, "readings"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <a className="history-link" href="/reports">
            Full reports →
          </a>
        </>
      )}
    </div>
  );
}

function A1CSummaryCard({ person }: { person: Person }) {
  const [estimates, setEstimates] = useState<A1CEstimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getA1CEstimates(person.id)
      .then(setEstimates)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [person.id]);

  const headline = estimates?.find((e) => e.key === "30d") ?? estimates?.find((e) => e.estimatedA1c != null);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{person.name}&apos;s estimated A1C</h3>
      {error && <p className="meta">{error}</p>}
      {!error && !estimates && <p className="meta">Loading…</p>}
      {estimates && !headline && <p className="meta">Not enough data yet.</p>}
      {headline && (
        <>
          <p style={{ fontSize: "2.2rem", fontWeight: 700, margin: "0.25rem 0" }}>{headline.estimatedA1c}%</p>
          <p className="meta">
            {headline.label.toLowerCase()}, avg {headline.averageMgdl} mg/dL
          </p>
        </>
      )}
      <a className="history-link" href="/reports">
        See all windows →
      </a>
    </div>
  );
}

function SupportWidget() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);

  useEffect(() => {
    getTickets().then(setTickets).catch(() => setTickets([]));
  }, []);

  const openCount = tickets?.filter((t) => t.status === "open").length ?? 0;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Need help?</h3>
      <p className="meta">
        {tickets == null
          ? "Loading..."
          : openCount > 0
            ? `You have ${openCount} open support ${openCount === 1 ? "ticket" : "tickets"}.`
            : "No open support tickets."}
      </p>
      <a className="history-link" href="/support">
        Go to Support →
      </a>
    </div>
  );
}

export default function DashboardPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPeople()
      .then(setPeople)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (error) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p className="meta">Couldn&apos;t reach the Worker API: {error}</p>
      </section>
    );
  }

  if (!people) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p className="meta">Loading…</p>
      </section>
    );
  }

  if (people.length === 0) {
    return (
      <section>
        <h1>Dashboard</h1>
        <div className="card" style={{ maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>Finish setting up</h3>
          <p className="meta">
            Your account is created, but you haven&apos;t connected Dexcom yet. Pick up where you
            left off to start monitoring.
          </p>
          <a className="btn-primary" href="/onboarding">
            Finish setup
          </a>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Dashboard</h1>
      <div className="card-grid">
        {people.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
      <div style={{ marginTop: "1.5rem" }} className="card-grid">
        {people.map((p) => (
          <TrendChartCard key={p.id} person={p} />
        ))}
      </div>
      <div style={{ marginTop: "1.5rem" }} className="card-grid">
        {people.map((p) => (
          <TierPieCard key={p.id} person={p} />
        ))}
        {people.map((p) => (
          <A1CSummaryCard key={p.id} person={p} />
        ))}
      </div>
      <div style={{ marginTop: "1.5rem" }} className="card-grid">
        <SupportWidget />
      </div>
    </section>
  );
}
