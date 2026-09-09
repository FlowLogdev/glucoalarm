"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getHistory, getPeople, type Person, type Reading, type ReportPeriod } from "../../../lib/api";
import { InsightCard } from "../../../lib/InsightCard";

const RANGES = [
  { label: "3h", hours: 3 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
];

// Hours-range picker above maps loosely onto the AI insight's own periods.
function periodFor(hours: number): ReportPeriod {
  return hours <= 24 ? "week" : "month";
}

export default function HistoryPage() {
  const params = useParams<{ personId: string }>();
  const personId = params.personId;

  const [person, setPerson] = useState<Person | null>(null);
  const [hours, setHours] = useState(24);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPeople()
      .then((people) => setPerson(people.find((p) => p.id === personId) ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [personId]);

  useEffect(() => {
    setReadings(null);
    getHistory(personId, hours)
      .then(setReadings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [personId, hours]);

  const chartData =
    readings?.map((r) => ({
      time: new Date(r.recorded_at * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: r.value_mgdl,
    })) ?? [];

  const yMax = Math.max(300, person?.critical_high ?? 250);

  return (
    <section>
      <h1>{person?.name ?? personId} — History</h1>
      {error && <p className="meta">{error}</p>}

      <div className="range-toggle">
        {RANGES.map((r) => (
          <button
            key={r.label}
            className={hours === r.hours ? "active" : ""}
            onClick={() => setHours(r.hours)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ height: 360 }}>
        {!readings ? (
          <p className="meta">Loading…</p>
        ) : readings.length === 0 ? (
          <p className="meta">No readings in this range yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262b33" />
              <XAxis dataKey="time" stroke="#9aa1ab" fontSize={12} minTickGap={40} />
              <YAxis stroke="#9aa1ab" fontSize={12} domain={[40, yMax]} />
              <Tooltip
                contentStyle={{ background: "#15181d", border: "1px solid #262b33", color: "#e8eaed" }}
              />
              {person && (
                <>
                  {/* Tier bands so a rise/drop out of range is visible at a glance,
                      not just readable from the tooltip. */}
                  <ReferenceArea y1={person.critical_high} y2={yMax} fill="var(--status-red)" fillOpacity={0.08} />
                  <ReferenceArea
                    y1={person.safe_high}
                    y2={person.critical_high}
                    fill="var(--status-orange)"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea
                    y1={person.safe_low}
                    y2={person.safe_high}
                    fill="var(--status-green)"
                    fillOpacity={0.06}
                  />
                  <ReferenceArea
                    y1={person.critical_low}
                    y2={person.safe_low}
                    fill="var(--status-orange)"
                    fillOpacity={0.08}
                  />
                  <ReferenceArea y1={40} y2={person.critical_low} fill="var(--status-red)" fillOpacity={0.08} />
                </>
              )}
              <Line type="monotone" dataKey="value" stroke="#2fb96a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <InsightCard personId={personId} period={periodFor(hours)} />
      </div>
    </section>
  );
}
