"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getAllTimezones, timezoneOffsetLabel } from "../../lib/timezones";
import { GlucoalarmBot } from "../../lib/GlucoalarmBot";
import {
  addSubscriber,
  getCurrentAdmin,
  getDoctors,
  getPeople,
  getServiceStatus,
  getSubscribers,
  inviteDoctor,
  removeDoctor,
  removeSubscriber,
  restartService,
  updateReportEmailSettings,
  updateSubscriberCallLanguage,
  updateSubscriberSchedule,
  updateSubscriberWhatsapp,
  updateThresholds,
  updateTickerInterval,
  updateTimezone,
  type CallLanguage,
  type CurrentAdmin,
  type Doctor,
  type Person,
  type ServiceStatus,
  type Subscriber,
} from "../../lib/api";

const TICKER_OPTIONS = [5, 8, 10, 15, 20, 30, 60];

function ReportEmailForm({ person, readOnly }: { person: Person; readOnly: boolean }) {
  const [email, setEmail] = useState(person.report_email_address ?? "");
  const [weekly, setWeekly] = useState(!!person.report_email_weekly);
  const [monthly, setMonthly] = useState(!!person.report_email_monthly);
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      await updateReportEmailSettings(person.id, email, weekly, monthly);
      setStatus("Saved.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
        <p className="meta">
          Automatically email {person.name}&apos;s weekly and/or monthly glucose reports as soon
          as they&apos;re generated, in addition to the WhatsApp notification.
        </p>
        <label>
          Email address
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} style={{ width: "auto" }} />
          Email weekly reports
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} style={{ width: "auto" }} />
          Email monthly reports
        </label>
        <button type="submit">Save</button>
        {status && <p className="meta">{status}</p>}
      </fieldset>
    </form>
  );
}

function TickerIntervalForm({ person, onSaved, readOnly }: { person: Person; onSaved: () => void; readOnly: boolean }) {
  const [minutes, setMinutes] = useState(person.ticker_interval_minutes ?? 20);
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      await updateTickerInterval(person.id, minutes);
      setStatus("Saved.");
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
        <p className="meta">
          How often to send a WhatsApp check-in while {person.name}&apos;s glucose is in the safe
          range. Out-of-range alerts are unaffected by this setting.
        </p>
        <label>
          Check-in every
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {TICKER_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Save</button>
        {status && <p className="meta">{status}</p>}
      </fieldset>
    </form>
  );
}

function ThresholdForm({ person, onSaved, readOnly }: { person: Person; onSaved: () => void; readOnly: boolean }) {
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
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
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
      </fieldset>
    </form>
  );
}

function TimezoneForm({ person, onSaved, readOnly }: { person: Person; onSaved: () => void; readOnly: boolean }) {
  const [timezone, setTimezone] = useState(person.timezone ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const groups = useMemo(getAllTimezones, []);

  async function save(value: string) {
    setStatus(null);
    try {
      await updateTimezone(person.id, value || null);
      setTimezone(value);
      setStatus("Saved.");
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(timezone); }}>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
        <p className="meta">
          Used to compute time-of-day pattern insights in the right local time. Auto-detected from
          whatever device last viewed Reports; override here if that's wrong (e.g. traveling).
        </p>
        <label>
          Timezone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="">Not set</option>
            {groups.map((group) => (
              <optgroup key={group.region} label={group.region}>
                {group.zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")} ({timezoneOffsetLabel(zone)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit">Save</button>
          <button type="button" onClick={() => save(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
            Use this device&apos;s timezone
          </button>
        </div>
        {status && <p className="meta">{status}</p>}
      </fieldset>
    </form>
  );
}

const STATUS_META: Record<ServiceStatus["status"], { color: string; label: string }> = {
  connected: { color: "var(--status-green)", label: "Connected and active" },
  connecting: { color: "var(--status-orange)", label: "Trying to connect" },
  down: { color: "var(--status-red)", label: "Service down" },
};

function ServiceStatusCard({ person, readOnly }: { person: Person; readOnly: boolean }) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  function refresh() {
    getServiceStatus(person.id)
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [person.id]);

  async function onRestart() {
    setError(null);
    setRestarting(true);
    try {
      const updated = await restartService(person.id);
      setStatus(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't restart the connection");
    } finally {
      setRestarting(false);
    }
  }

  const meta = status ? STATUS_META[status.status] : null;

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: meta?.color ?? "var(--status-gray)",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <div>
            <strong>{person.name}&apos;s connection: {meta?.label ?? "Checking..."}</strong>
            {status && <div className="meta">{status.detail}</div>}
          </div>
        </div>
        <button type="button" onClick={onRestart} disabled={restarting || readOnly}>
          {restarting ? "Restarting..." : "Restart service"}
        </button>
      </div>
      {error && <p className="meta">{error}</p>}
    </div>
  );
}

function DoctorAccessCard() {
  const [doctors, setDoctors] = useState<Doctor[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function refresh() {
    getDoctors()
      .then(setDoctors)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      await inviteDoctor(email, name);
      setEmail("");
      setName("");
      setStatus("Invitation sent.");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite doctor");
    } finally {
      setLoading(false);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      await removeDoctor(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Doctor access</h3>
      <p className="meta">
        Invite your doctor for read-only access to readings, reports, and CSV downloads. They
        won&apos;t be able to change any settings, contacts, or billing.
      </p>
      {doctors?.map((d) => (
        <div className="subscriber-row" key={d.id}>
          <span>{d.email}</span>
          <button className="danger" onClick={() => onRemove(d.id)}>
            Remove
          </button>
        </div>
      ))}
      {doctors?.length === 0 && <p className="meta">No doctors invited yet.</p>}

      <form onSubmit={onInvite} style={{ marginTop: "1rem" }}>
        <label>
          Doctor&apos;s name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Smith" />
        </label>
        <label>
          Doctor&apos;s email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Sending invite..." : "Invite doctor"}
        </button>
      </form>
      {status && <p className="meta">{status}</p>}
      {error && <p className="meta">{error}</p>}
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesToTimeInput(minutes: number | null): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeInputToMinutes(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function ScheduleEditor({ subscriber, readOnly, onSaved }: { subscriber: Subscriber; readOnly: boolean; onSaved: () => void }) {
  const hasSchedule = subscriber.active_start_minute != null;
  const [enabled, setEnabled] = useState(hasSchedule);
  const [start, setStart] = useState(minutesToTimeInput(subscriber.active_start_minute));
  const [end, setEnd] = useState(minutesToTimeInput(subscriber.active_end_minute));
  const [days, setDays] = useState<Set<number>>(
    new Set(subscriber.active_days ? subscriber.active_days.split(",").map(Number) : [])
  );
  const [status, setStatus] = useState<string | null>(null);

  function toggleDay(day: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function onSave() {
    setStatus(null);
    try {
      if (!enabled) {
        await updateSubscriberSchedule(subscriber.id, { active_start_minute: null, active_end_minute: null, active_days: null });
      } else {
        const startMin = timeInputToMinutes(start);
        const endMin = timeInputToMinutes(end);
        if (startMin == null || endMin == null) {
          setStatus("Set both a start and end time");
          return;
        }
        await updateSubscriberSchedule(subscriber.id, {
          active_start_minute: startMin,
          active_end_minute: endMin,
          active_days: days.size > 0 ? [...days].sort().join(",") : null,
        });
      }
      setStatus("Saved.");
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div style={{ marginTop: "0.4rem", marginBottom: "0.75rem", paddingLeft: "0.25rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} />
        <span className="meta">Limit alerts to specific hours (always on if unchecked)</span>
      </label>
      {enabled && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <label>
            From
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={readOnly} />
          </label>
          <label>
            To
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={readOnly} />
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {DAY_LABELS.map((label, i) => (
              <label key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", fontWeight: 400, fontSize: "0.8rem" }}>
                {label}
                <input type="checkbox" checked={days.has(i)} onChange={() => toggleDay(i)} disabled={readOnly} />
              </label>
            ))}
          </div>
          <span className="meta">No days checked = every day</span>
        </div>
      )}
      {!readOnly && (
        <button type="button" onClick={onSave} style={{ marginTop: "0.5rem" }}>
          Save schedule
        </button>
      )}
      {status && <p className="meta">{status}</p>}
    </div>
  );
}

const CALL_LANGUAGE_OPTIONS: { value: CallLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
];

function CallLanguagePicker({ subscriber, readOnly, onSaved }: { subscriber: Subscriber; readOnly: boolean; onSaved: () => void }) {
  const [status, setStatus] = useState<string | null>(null);

  async function onChange(value: CallLanguage) {
    setStatus(null);
    try {
      await updateSubscriberCallLanguage(subscriber.id, value);
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div style={{ marginTop: "0.4rem", paddingLeft: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
        <span className="meta">Call language</span>
        <select value={subscriber.call_language} onChange={(e) => onChange(e.target.value as CallLanguage)} disabled={readOnly}>
          {CALL_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {status && <p className="meta">{status}</p>}
    </div>
  );
}

function WhatsappToggle({ subscriber, readOnly, onSaved }: { subscriber: Subscriber; readOnly: boolean; onSaved: () => void }) {
  const [status, setStatus] = useState<string | null>(null);

  async function onChange(checked: boolean) {
    setStatus(null);
    try {
      await updateSubscriberWhatsapp(subscriber.id, checked);
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div style={{ marginTop: "0.4rem", paddingLeft: "0.25rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
        <input
          type="checkbox"
          checked={!!subscriber.whatsapp_enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
        />
        <span className="meta">
          WhatsApp messages {subscriber.whatsapp_enabled ? "on" : "off"} (urgent low calls are unaffected)
        </span>
      </label>
      {status && <p className="meta">{status}</p>}
    </div>
  );
}

function SubscriberManager({ personId, readOnly }: { personId: string; readOnly: boolean }) {
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
        <div key={s.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "0.5rem" }}>
          <div className="subscriber-row">
            <span>
              {s.phone_number} {s.label && <span className="meta">({s.label})</span>}
            </span>
            <button className="danger" onClick={() => onRemove(s.id)} disabled={readOnly}>
              Remove
            </button>
          </div>
          <ScheduleEditor subscriber={s} readOnly={readOnly} onSaved={refresh} />
          <CallLanguagePicker subscriber={s} readOnly={readOnly} onSaved={refresh} />
          <WhatsappToggle subscriber={s} readOnly={readOnly} onSaved={refresh} />
        </div>
      ))}
      {subscribers?.length === 0 && <p className="meta">No phone numbers yet.</p>}

      <form onSubmit={onAdd} style={{ marginTop: "1rem" }}>
        <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
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
        </fieldset>
      </form>
      {error && <p className="meta">{error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getPeople()
      .then(setPeople)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, []);
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
        <h1>Settings</h1>
        {readOnly && (
          <div className="card" style={{ borderColor: "var(--status-orange)", marginBottom: "1.5rem" }}>
            <strong>Read-only access.</strong>{" "}
            <span className="meta">
              You were invited as a doctor. You can view readings, reports, and download data, but
              can&apos;t change any settings, contacts, or billing.
            </span>
          </div>
        )}
        {people.map((person) => (
          <section key={person.id}>
            <h2>{person.name}</h2>
            <ServiceStatusCard person={person} readOnly={readOnly} />
            <div className="card-grid">
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Thresholds</h3>
                <ThresholdForm person={person} onSaved={refresh} readOnly={readOnly} />
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Alert phone numbers</h3>
                <SubscriberManager personId={person.id} readOnly={readOnly} />
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Timezone</h3>
                <TimezoneForm person={person} onSaved={refresh} readOnly={readOnly} />
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Safe-range check-ins</h3>
                <TickerIntervalForm person={person} onSaved={refresh} readOnly={readOnly} />
              </div>
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Email reports</h3>
                <ReportEmailForm person={person} readOnly={readOnly} />
              </div>
            </div>
          </section>
        ))}
        {!readOnly && (
          <section>
            <h2>Access</h2>
            <div className="card-grid">
              <DoctorAccessCard />
            </div>
          </section>
        )}
      </div>
      <GlucoalarmBot subtitle="Ask a setup question" />
    </div>
  );
}
