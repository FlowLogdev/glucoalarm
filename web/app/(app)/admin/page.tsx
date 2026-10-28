"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCurrentAdmin,
  getOpsErrors,
  getOpsScan,
  retryOpsPerson,
  type OpsErrorEntry,
  type OpsPersonHealth,
  type OpsPersonStatus,
  type OpsScan,
} from "../../lib/api";
import { CronTab, CustomersTab, MessagesTab, SecurityTab } from "./log-tabs";

const TABS = [
  ["overview", "Overview"],
  ["customers", "Customers"],
  ["messages", "Messages"],
  ["cron", "Poller runs"],
  ["security", "Security"],
  ["errors", "Errors"],
] as const;
type Tab = (typeof TABS)[number][0];

const STATUS_COLORS: Record<OpsPersonStatus, string> = {
  ok: "var(--status-green)",
  degraded: "var(--status-orange)",
  down: "var(--status-red)",
  no_data: "var(--status-red)",
  inactive: "var(--status-gray)",
  demo: "var(--status-gray)",
};

const STATUS_LABELS: Record<OpsPersonStatus, string> = {
  ok: "Live",
  degraded: "Errors (data still fresh)",
  down: "DOWN - no new data",
  no_data: "No data ever received",
  inactive: "Subscription inactive",
  demo: "App Review demo",
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

function formatTime(ts: number | null): string {
  if (!ts) return "never";
  return new Date(ts * 1000).toLocaleString();
}

function formatAgo(now: number, ts: number | null): string {
  if (!ts) return "never";
  const minutes = Math.round((now - ts) / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [scan, setScan] = useState<OpsScan | null>(null);
  const [errors, setErrors] = useState<OpsErrorEntry[]>([]);
  const [hours, setHours] = useState(24);
  const [personFilter, setPersonFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    getCurrentAdmin()
      .then((a) => setAllowed(a.is_super_admin))
      .catch(() => setAllowed(false));
  }, []);

  const runScan = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [s, e] = await Promise.all([getOpsScan(), getOpsErrors(hours, personFilter || undefined, sourceFilter || undefined)]);
      setScan(s);
      setErrors(e);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [hours, personFilter, sourceFilter]);

  useEffect(() => {
    if (allowed) runScan();
  }, [allowed, runScan]);

  async function onRetry(p: OpsPersonHealth) {
    setMessage(`Retrying Dexcom for ${p.name}...`);
    try {
      const result = await retryOpsPerson(p.person_id);
      setMessage(`${p.name}: ${result.status} - ${result.detail}`);
      await runScan();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Retry failed");
    }
  }

  if (allowed === null) return <p className="meta">Loading...</p>;
  if (!allowed) {
    return (
      <>
        <h1>Logs console</h1>
        <p className="meta">This page is only available to GlucoAlarm super-admins.</p>
      </>
    );
  }

  const issues = (scan?.people ?? [])
    .filter((p) => p.diagnosis && p.status !== "demo")
    .sort((x, y) => SEVERITY_ORDER[x.diagnosis!.severity] - SEVERITY_ORDER[y.diagnosis!.severity]);
  const nameById = Object.fromEntries((scan?.people ?? []).map((p) => [p.person_id, p.name]));
  const cronAgeMinutes = scan?.last_cron_run ? (scan.now - scan.last_cron_run) / 60 : null;

  return (
    <>
      <h1>Logs console</h1>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={runScan} disabled={loading}>
          {loading ? "Scanning..." : "Run scan"}
        </button>
        {scan && <span className="meta">Last scan: {formatTime(scan.now)}</span>}
      </div>
      {message && <p className="meta">{message}</p>}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{ background: tab === key ? "var(--panel)" : "transparent", border: "none", borderBottom: tab === key ? "2px solid var(--status-green)" : "2px solid transparent", borderRadius: 0, color: tab === key ? "var(--text)" : "var(--text-dim)", padding: "8px 12px", cursor: "pointer" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "customers" && <CustomersTab />}
      {tab === "messages" && <MessagesTab />}
      {tab === "cron" && <CronTab />}
      {tab === "security" && <SecurityTab />}

      {scan && tab === "overview" && (
        <>
          <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div className="card">
              <div className="meta">Poller (cron)</div>
              <h3 style={{ margin: "4px 0", color: cronAgeMinutes != null && cronAgeMinutes < 11 ? "var(--status-green)" : "var(--status-red)" }}>
                {cronAgeMinutes == null ? "No heartbeat yet" : cronAgeMinutes < 11 ? "Running" : "STOPPED"}
              </h3>
              <div className="meta">Last run {formatAgo(scan.now, scan.last_cron_run)}</div>
            </div>
            <div className="card">
              <div className="meta">Customers</div>
              <h3 style={{ margin: "4px 0" }}>{scan.counts.customers_total}</h3>
              <div className="meta">
                {Object.entries(scan.counts.customers_by_status)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(", ") || "none"}
              </div>
            </div>
            <div className="card">
              <div className="meta">New signups</div>
              <h3 style={{ margin: "4px 0" }}>{scan.counts.signups_7d}</h3>
              <div className="meta">last 7 days ({scan.counts.signups_30d} in 30 days)</div>
            </div>
            <div className="card">
              <div className="meta">Logins / monitored / phones</div>
              <h3 style={{ margin: "4px 0" }}>
                {scan.counts.logins} / {scan.counts.monitored_people} / {scan.counts.phone_subscribers}
              </h3>
              <div className="meta">admin accounts, people, alert numbers</div>
            </div>
          </div>

          <h2>Issues found ({issues.length})</h2>
          {issues.length === 0 && <p className="meta">No issues. Every active customer is receiving data.</p>}
          {issues.map((p) => (
            <div key={p.person_id} className="card" style={{ borderLeft: `4px solid ${p.diagnosis!.severity === "critical" ? "var(--status-red)" : p.diagnosis!.severity === "warning" ? "var(--status-orange)" : "var(--status-gray)"}`, marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>
                {p.name} <span className="meta">({p.customer_name})</span>
              </h3>
              <p>
                <strong>Cause:</strong> {p.diagnosis!.cause}
              </p>
              <p>
                <strong>Fix:</strong> {p.diagnosis!.fix}
              </p>
              <p className="meta">
                Last reading {formatAgo(scan.now, p.last_reading_at)}
                {p.dexcom_retry_after && ` · Dexcom back-off, next login attempt ${formatTime(p.dexcom_retry_after)}`}
                {p.last_error && ` · last error ${formatAgo(scan.now, p.last_error.created_at)}`}
              </p>
              {p.last_error && (
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "var(--bg)", padding: 8, borderRadius: 6 }}>{p.last_error.message}</pre>
              )}
              {p.status !== "inactive" && <button onClick={() => onRetry(p)}>Retry Dexcom now</button>}
            </div>
          ))}

          <h2>All monitored people</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-dim)" }}>
                  <th style={{ padding: 6 }}>Status</th>
                  <th style={{ padding: 6 }}>Person</th>
                  <th style={{ padding: 6 }}>Customer</th>
                  <th style={{ padding: 6 }}>Last reading</th>
                  <th style={{ padding: 6 }}>Phones</th>
                  <th style={{ padding: 6 }}>Errors 24h</th>
                </tr>
              </thead>
              <tbody>
                {scan.people.map((p) => (
                  <tr key={p.person_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: 6, whiteSpace: "nowrap" }}>
                      <span className="status-dot" style={{ ["--status" as string]: STATUS_COLORS[p.status] }} /> {STATUS_LABELS[p.status]}
                    </td>
                    <td style={{ padding: 6 }}>{p.name}</td>
                    <td style={{ padding: 6 }}>
                      {p.customer_name} <span className="meta">({p.subscription_status})</span>
                    </td>
                    <td style={{ padding: 6 }}>
                      {p.last_value != null ? `${p.last_value} mg/dL, ` : ""}
                      {formatAgo(scan.now, p.last_reading_at)}
                    </td>
                    <td style={{ padding: 6 }}>{p.subscribers}</td>
                    <td style={{ padding: 6 }}>{p.errors_24h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {scan && tab === "errors" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={1}>Last hour</option>
              <option value={24}>Last 24 hours</option>
              <option value={168}>Last 7 days</option>
              <option value={720}>Last 30 days</option>
            </select>
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="">All people</option>
              {scan.people.map((p) => (
                <option key={p.person_id} value={p.person_id}>
                  {p.name} ({p.customer_name})
                </option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              <option value="dexcom">Dexcom</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="voice">Voice calls</option>
              <option value="poll">Poller</option>
            </select>
          </div>
          {errors.length === 0 && <p className="meta">No errors in this window.</p>}
          {errors.map((e) => (
            <div key={e.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
              <div className="meta">
                {formatTime(e.created_at)} · {e.source} · {e.person_id ? nameById[e.person_id] ?? e.person_id : "system"}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.message}</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
