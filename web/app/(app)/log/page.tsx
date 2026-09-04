"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addInsulinLogEntry,
  getInsulinLog,
  getPeople,
  removeInsulinLogEntry,
  type InsulinLogEntry,
  type Person,
} from "../../lib/api";
import { suggestedDose } from "../../lib/dosing";

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PersonLog({ person }: { person: Person }) {
  const [entries, setEntries] = useState<InsulinLogEntry[] | null>(null);
  const [carbs, setCarbs] = useState("");
  const [food, setFood] = useState("");
  const [glucose, setGlucose] = useState("");
  const [dose, setDose] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getInsulinLog(person.id)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, [person.id]);

  const carbsNum = carbs ? Number(carbs) : null;
  const glucoseNum = glucose ? Number(glucose) : null;
  const formulaConfigured = person.carb_ratio != null || person.correction_factor != null;
  const suggestion = suggestedDose(person, carbsNum, glucoseNum);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!carbs && !dose) {
      setError("Enter at least carbs or the dose given.");
      return;
    }
    try {
      await addInsulinLogEntry({
        personId: person.id,
        carbsGrams: carbsNum,
        foodDescription: food,
        glucoseAtDose: glucoseNum,
        doseUnits: dose ? Number(dose) : null,
        note,
      });
      setCarbs("");
      setFood("");
      setGlucose("");
      setDose("");
      setNote("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function onDelete(id: number) {
    setError(null);
    try {
      await removeInsulinLogEntry(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <section>
      <h2>{person.name}</h2>
      <div className="card-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Log an entry</h3>
          <form onSubmit={onSubmit}>
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
              What was eaten (optional)
              <input type="text" value={food} onChange={(e) => setFood(e.target.value)} placeholder="pasta" />
            </label>
            <label>
              Glucose at time of dose (mg/dL, optional)
              <input
                type="number"
                min="0"
                step="1"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value)}
                placeholder="e.g. 180"
              />
            </label>

            {!formulaConfigured && (
              <p className="meta">
                No dosing formula set for {person.name} yet. Add one in Settings to see the math
                here.
              </p>
            )}
            {suggestion && (
              <div className="card" style={{ background: "var(--bg)" }}>
                <p className="meta" style={{ marginBottom: "0.4rem" }}>
                  Per {person.name}&apos;s saved formula: {suggestion.carbPortion.toFixed(1)}u for carbs
                  {suggestion.correctionPortion > 0 && ` + ${suggestion.correctionPortion.toFixed(1)}u correction`}
                </p>
                <p style={{ fontWeight: 700, fontSize: "1.3rem", margin: 0 }}>{suggestion.total}u</p>
                <p className="meta" style={{ marginTop: "0.4rem" }}>
                  Not medical advice. Confirm with your care team before dosing.
                </p>
              </div>
            )}

            <label>
              Dose actually given (units)
              <input
                type="number"
                min="0"
                step="0.5"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="e.g. 6.5"
              />
            </label>
            <label>
              Note (optional)
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="submit">Save entry</button>
            {error && <p className="meta">{error}</p>}
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent entries</h3>
          {!entries ? (
            <p className="meta">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="meta">No entries yet.</p>
          ) : (
            entries.map((entry) => (
              <div className="subscriber-row" key={entry.id}>
                <span>
                  <strong>{formatTime(entry.logged_at)}</strong>
                  <br />
                  <span className="meta">
                    {entry.carbs_grams != null && `${entry.carbs_grams}g carbs`}
                    {entry.food_description && ` (${entry.food_description})`}
                    {entry.glucose_at_dose != null && ` · ${entry.glucose_at_dose} mg/dL`}
                    {entry.dose_units != null && ` · ${entry.dose_units}u given`}
                    {entry.note && ` · ${entry.note}`}
                  </span>
                </span>
                <button className="danger" onClick={() => onDelete(entry.id)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default function LogPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPeople()
      .then(setPeople)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  if (error) return <p className="meta">{error}</p>;
  if (!people) return <p className="meta">Loading…</p>;

  return (
    <>
      <h1>Carb &amp; insulin log</h1>
      <p className="meta">
        This log records what was eaten and what dose was given. Any math shown uses the
        formula you enter in Settings, exactly as your doctor prescribed it. Nothing here is
        AI-generated or a dosing recommendation.
      </p>
      {people.map((person) => (
        <PersonLog key={person.id} person={person} />
      ))}
    </>
  );
}
