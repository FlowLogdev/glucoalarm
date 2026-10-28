"use client";

import { useEffect, useState } from "react";
import { getInsulinLogs, getPeople, type InsulinLogEntry, type Person } from "../../lib/api";

function typeLabel(type: InsulinLogEntry["insulin_type"]) {
  return type === "fast_acting" ? "Fast-acting" : type === "long_acting" ? "Long-acting" : "Insulin";
}

function units(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function localWhen(seconds: number, timezone: string | null) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone ?? undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(seconds * 1000));
}

function InsulinLogCard({ person }: { person: Person }) {
  const [logs, setLogs] = useState<InsulinLogEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getInsulinLogs(person.id).then(setLogs).catch((err) => setError(err instanceof Error ? err.message : "Could not load insulin records."));
  }, [person.id]);

  return <section className="card">
    <h2 style={{ marginTop: 0 }}>{person.name}&apos;s insulin log</h2>
    <p className="meta">Entries sent through verified WhatsApp numbers today. These records are not dose recommendations.</p>
    <p className="meta">WhatsApp: <code>/log fast acting 3</code>, <code>/log long acting 12</code>, or <code>/log status</code>.</p>
    {error && <p className="meta">{error}</p>}
    {!error && !logs && <p className="meta">Loading…</p>}
    {logs?.length === 0 && <p className="meta">No insulin entries recorded today.</p>}
    {logs?.map((entry) => <div className="subscriber-row" key={entry.id}>
      <span><strong>{typeLabel(entry.insulin_type)}</strong> · {units(entry.dose_units)} units<br /><span className="meta">{localWhen(entry.logged_at, person.timezone)}</span></span>
      <span className="meta">{entry.glucose_at_dose == null ? "No CGM reading within 15 min" : `${entry.glucose_at_dose} mg/dL${entry.glucose_recorded_at ? ` · ${localWhen(entry.glucose_recorded_at, person.timezone)}` : ""}`}</span>
    </div>)}
  </section>;
}

export default function LogPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { getPeople().then(setPeople).catch((err) => setError(err instanceof Error ? err.message : "Could not load people.")); }, []);
  return <section>
    <h1>Insulin log</h1>
    <p className="meta">A caregiver-entered record of insulin already given and the nearest available CGM reading. GlucoAlarm does not calculate or recommend insulin doses.</p>
    {error && <p className="meta">{error}</p>}
    {!error && !people && <p className="meta">Loading…</p>}
    {people?.map((person) => <InsulinLogCard key={person.id} person={person} />)}
  </section>;
}
