"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getHistory, getPeople, type Person, type Reading } from "../../lib/api";

const RANGES = [
  { label: "3h", hours: 3 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
];

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
              <YAxis stroke="#9aa1ab" fontSize={12} domain={[40, 300]} />
              <Tooltip
                contentStyle={{ background: "#15181d", border: "1px solid #262b33", color: "#e8eaed" }}
              />
              <Line type="monotone" dataKey="value" stroke="#2fb96a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
