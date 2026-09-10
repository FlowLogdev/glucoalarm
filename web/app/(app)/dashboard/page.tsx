"use client";

import { useEffect, useState } from "react";
import { getPeople, getLatestReading, getTickets, type LatestReadingResponse, type Person, type SupportTicket } from "../../lib/api";
import { trendArrow, statusColor, statusLabel, minutesAgo } from "../../lib/format";
import { suggestedDose } from "../../lib/dosing";

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

function CalculatorCard({ person }: { person: Person }) {
  const [carbs, setCarbs] = useState("");
  const [glucose, setGlucose] = useState("");

  const hasFormula = person.carb_ratio != null || person.correction_factor != null;
  const suggestion = suggestedDose(person, carbs ? Number(carbs) : null, glucose ? Number(glucose) : null);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Insulin calculator — {person.name}</h3>
      {!hasFormula ? (
        <p className="meta">
          No dosing formula set for {person.name} yet. Add one in Settings (carb ratio /
          correction factor) to use this calculator.
        </p>
      ) : (
        <>
          <div className="card-grid" style={{ gap: "1rem" }}>
            <label>
              Carbs eaten (g)
              <input
                type="number"
                min="0"
                step="1"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="e.g. 45"
              />
            </label>
            <label>
              Current glucose (mg/dL)
              <input
                type="number"
                min="0"
                step="1"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value)}
                placeholder="e.g. 180"
              />
            </label>
          </div>

          {suggestion ? (
            <div className="card" style={{ background: "var(--bg)", marginTop: "1rem" }}>
              <p className="meta" style={{ marginBottom: "0.4rem" }}>
                Per {person.name}&apos;s saved formula: {suggestion.carbPortion.toFixed(1)}u for carbs
                {suggestion.correctionPortion > 0 && ` + ${suggestion.correctionPortion.toFixed(1)}u correction`}
              </p>
              <p style={{ fontWeight: 700, fontSize: "1.5rem", margin: 0 }}>{suggestion.total}u</p>
            </div>
          ) : (
            <p className="meta" style={{ marginTop: "1rem" }}>
              Enter carbs and/or glucose above to calculate.
            </p>
          )}
          <p className="meta" style={{ marginTop: "0.75rem" }}>
            Plain arithmetic from the formula in Settings only. Not medical advice, not
            AI-generated. Confirm with your care team before dosing.
          </p>
        </>
      )}
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
          <CalculatorCard key={p.id} person={p} />
        ))}
      </div>
      <div style={{ marginTop: "1.5rem" }} className="card-grid">
        <SupportWidget />
      </div>
    </section>
  );
}
