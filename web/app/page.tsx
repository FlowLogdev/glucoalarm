"use client";

import { useEffect, useState } from "react";
import { getPeople, getLatestReading, type LatestReadingResponse, type Person } from "./lib/api";
import { trendArrow, statusColor, statusLabel, minutesAgo } from "./lib/format";

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
        <div className="name">{person.name}</div>
        <p className="meta">Couldn&apos;t reach the API: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card person-card" style={statusVar("var(--status-gray)")}>
        <div className="name">{person.name}</div>
        <p className="meta">Loading…</p>
      </div>
    );
  }

  const { reading, status, now } = data;

  return (
    <div className="card person-card" style={statusVar(statusColor(status))}>
      <div className="name">
        {person.name}
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

  return (
    <section>
      <h1>Dashboard</h1>
      <div className="card-grid">
        {people.map((p) => (
          <PersonCard key={p.id} person={p} />
        ))}
      </div>
    </section>
  );
}
