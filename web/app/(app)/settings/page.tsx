"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addSubscriber,
  getPeople,
  getSubscribers,
  removeSubscriber,
  updateThresholds,
  type Person,
  type Subscriber,
} from "../../lib/api";

function ThresholdForm({ person, onSaved }: { person: Person; onSaved: () => void }) {
  const [safeLow, setSafeLow] = useState(person.safe_low);
  const [safeHigh, setSafeHigh] = useState(person.safe_high);
  const [criticalLow, setCriticalLow] = useState(person.critical_low);
  const [criticalHigh, setCriticalHigh] = useState(person.critical_high);
  const [staleMinutes, setStaleMinutes] = useState(person.stale_minutes);
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (criticalLow >= safeLow || safeLow >= safeHigh || safeHigh >= criticalHigh) {
      setStatus("Thresholds must satisfy: critical low < safe low < safe high < critical high");
      return;
    }
    try {
      await updateThresholds(person.id, safeLow, safeHigh, criticalLow, criticalHigh, staleMinutes);
      setStatus("Saved.");
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">
        Safe range: no WhatsApp messages. Between safe and critical: every 5 min. Beyond critical:
        every 1 min, marked CRITICAL.
      </p>
      <label>
        Critical low (mg/dL) — below this, every 1 min
        <input
          type="number"
          value={criticalLow}
          onChange={(e) => setCriticalLow(Number(e.target.value))}
          required
        />
      </label>
      <label>
        Safe range low (mg/dL)
        <input type="number" value={safeLow} onChange={(e) => setSafeLow(Number(e.target.value))} required />
      </label>
      <label>
        Safe range high (mg/dL)
        <input
          type="number"
          value={safeHigh}
          onChange={(e) => setSafeHigh(Number(e.target.value))}
          required
        />
      </label>
      <label>
        Critical high (mg/dL) — above this, every 1 min
        <input
          type="number"
          value={criticalHigh}
          onChange={(e) => setCriticalHigh(Number(e.target.value))}
          required
        />
      </label>
      <label>
        Stale after (minutes)
        <input
          type="number"
          value={staleMinutes}
          onChange={(e) => setStaleMinutes(Number(e.target.value))}
          required
        />
      </label>
      <button type="submit">Save thresholds</button>
      {status && <p className="meta">{status}</p>}
    </form>
  );
}

function SubscriberManager({ personId }: { personId: string }) {
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getSubscribers(personId)
      .then(setSubscribers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, [personId]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addSubscriber(personId, phoneNumber, label);
      setPhoneNumber("");
      setLabel("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    }
  }

  async function onRemove(id: number) {
    setError(null);
    try {
      await removeSubscriber(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div>
      {subscribers?.map((s) => (
        <div className="subscriber-row" key={s.id}>
          <span>
            {s.phone_number} {s.label && <span className="meta">({s.label})</span>}
          </span>
          <button className="danger" onClick={() => onRemove(s.id)}>
            Remove
          </button>
        </div>
      ))}
      {subscribers?.length === 0 && <p className="meta">No phone numbers yet.</p>}

      <form onSubmit={onAdd} style={{ marginTop: "1rem" }}>
        <label>
          Phone number (E.164, e.g. +13055551234)
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+13055551234"
            required
          />
        </label>
        <label>
          Label (optional)
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mom's phone" />
        </label>
        <button type="submit">Add phone number</button>
      </form>
      {error && <p className="meta">{error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getPeople()
      .then(setPeople)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, []);

  if (error) return <p className="meta">{error}</p>;
  if (!people) return <p className="meta">Loading…</p>;

  return (
    <>
      <h1>Settings</h1>
      {people.map((person) => (
        <section key={person.id}>
          <h2>{person.name}</h2>
          <div className="card-grid">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Thresholds</h3>
              <ThresholdForm person={person} onSaved={refresh} />
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Alert phone numbers</h3>
              <SubscriberManager personId={person.id} />
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
