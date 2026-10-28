"use client";

import { useEffect, useState } from "react";
import {
  getOpsAudit,
  getOpsCronRuns,
  getOpsCustomers,
  getOpsMessages,
  type OpsAuditEntry,
  type OpsCronRun,
  type OpsCustomer,
  type OpsMessage,
} from "../../lib/api";

// The secondary logs-console tabs. Each loads on its own when opened so the
// default Overview scan stays one quick request pair.

const cell = { padding: 6, verticalAlign: "top" as const };
const FAILED_STATUSES = new Set(["failed", "undelivered", "send_failed", "busy", "no-answer", "canceled"]);

function formatTime(ts: number | null): string {
  return ts ? new Date(ts * 1000).toLocaleString() : "never";
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    load()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function HoursSelect({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value={1}>Last hour</option>
      <option value={24}>Last 24 hours</option>
      <option value={168}>Last 7 days</option>
      <option value={720}>Last 30 days</option>
    </select>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-dim)" }}>
            {head.map((h) => (
              <th key={h} style={cell}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function CustomersTab() {
  const [query, setQuery] = useState("");
  const { data, error } = useLoad(getOpsCustomers, []);
  const q = query.trim().toLowerCase();
  const rows = (data ?? []).filter(
    (c) => !q || c.display_name.toLowerCase().includes(q) || (c.emails ?? "").toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  );
  return (
    <>
      <input placeholder="Search name, email, or id" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12, width: "100%", maxWidth: 360 }} />
      {error && <p className="meta">{error}</p>}
      {!data && !error && <p className="meta">Loading...</p>}
      {data && (
        <Table head={["Customer", "Login emails", "Status", "People / phones", "Signed up", "Last login"]}>
          {rows.map((c: OpsCustomer) => (
            <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={cell}>
                {c.display_name}
                {c.is_app_review_demo ? <span className="meta"> (App Review demo)</span> : null}
                <div className="meta" style={{ fontSize: 11 }}>{c.id}</div>
              </td>
              <td style={cell}>{c.emails ?? "-"}</td>
              <td style={cell}>
                <strong>{c.subscription_status}</strong>
                <div className="meta" style={{ fontSize: 11 }}>
                  Stripe: {c.stripe_subscription_status ?? "-"} · App Store: {c.revenuecat_subscription_status ?? "-"}
                </div>
              </td>
              <td style={cell}>
                {c.people} / {c.phones}
              </td>
              <td style={cell}>{formatTime(c.created_at)}</td>
              <td style={cell}>{formatTime(c.last_login)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export function MessagesTab() {
  const [hours, setHours] = useState(24);
  const [to, setTo] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const { data, error } = useLoad(() => getOpsMessages(hours, to.trim() || undefined), [hours, to]);
  const rows = (data ?? []).filter((m) => !onlyFailed || FAILED_STATUSES.has(m.status));
  const failed = (data ?? []).filter((m) => FAILED_STATUSES.has(m.status)).length;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <HoursSelect value={hours} onChange={setHours} />
        <input placeholder="Phone, e.g. +13055551234" value={to} onChange={(e) => setTo(e.target.value)} />
        <label className="meta">
          <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} /> Failed only
        </label>
        {data && (
          <span className="meta">
            {data.length} sent · {failed} failed
          </span>
        )}
      </div>
      {error && <p className="meta">{error}</p>}
      {!data && !error && <p className="meta">Loading...</p>}
      {data && rows.length === 0 && <p className="meta">No messages in this window.</p>}
      {data && rows.length > 0 && (
        <Table head={["Sent", "Channel", "To", "Message", "Status", "Error"]}>
          {rows.map((m: OpsMessage) => (
            <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={cell}>{formatTime(m.created_at)}</td>
              <td style={cell}>{m.channel}</td>
              <td style={cell}>{m.to_number}</td>
              <td style={cell}>{m.kind ?? "-"}</td>
              <td style={{ ...cell, color: FAILED_STATUSES.has(m.status) ? "var(--status-red)" : m.status === "delivered" || m.status === "read" || m.status === "completed" ? "var(--status-green)" : undefined }}>
                {m.status}
              </td>
              <td style={{ ...cell, fontSize: 12 }}>{[m.error_code, m.error_message].filter(Boolean).join(": ") || "-"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export function CronTab() {
  const [hours, setHours] = useState(24);
  const { data, error } = useLoad(() => getOpsCronRuns(hours), [hours]);
  const runs = data ?? [];
  // A healthy */5 cron logs ~12 runs/hour; gaps over 11 min are missed runs.
  const gaps = runs.slice(0, -1).filter((r, i) => r.started_at - runs[i + 1].started_at > 11 * 60).length;
  const avgMs = runs.length ? Math.round(runs.reduce((sum, r) => sum + r.duration_ms, 0) / runs.length) : 0;
  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <HoursSelect value={hours} onChange={setHours} />
        {data && (
          <span className="meta">
            {runs.length} runs · {gaps} gaps over 11 min · avg {avgMs} ms · {runs.reduce((sum, r) => sum + r.errors, 0)} errors
          </span>
        )}
      </div>
      {error && <p className="meta">{error}</p>}
      {!data && !error && <p className="meta">Loading...</p>}
      {data && runs.length === 0 && <p className="meta">No poller runs recorded in this window.</p>}
      {data && runs.length > 0 && (
        <Table head={["Started", "Duration", "People polled", "Errors"]}>
          {runs.map((r: OpsCronRun) => (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={cell}>{formatTime(r.started_at)}</td>
              <td style={cell}>{r.duration_ms} ms</td>
              <td style={cell}>{r.people_polled}</td>
              <td style={{ ...cell, color: r.errors ? "var(--status-red)" : undefined }}>{r.errors}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

export function SecurityTab() {
  const [hours, setHours] = useState(168);
  const [action, setAction] = useState("");
  const { data, error } = useLoad(() => getOpsAudit(hours), [hours]);
  const actions = Array.from(new Set((data ?? []).map((e) => e.action))).sort();
  const rows = (data ?? []).filter((e) => !action || e.action === action);
  const failedLogins = (data ?? []).filter((e) => e.action === "login_failed").length;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <HoursSelect value={hours} onChange={setHours} />
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All events</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {data && <span className="meta" style={{ color: failedLogins >= 5 ? "var(--status-red)" : undefined }}>{failedLogins} failed logins</span>}
      </div>
      {error && <p className="meta">{error}</p>}
      {!data && !error && <p className="meta">Loading...</p>}
      {data && rows.length === 0 && <p className="meta">No events in this window.</p>}
      {data && rows.length > 0 && (
        <Table head={["Time", "Event", "Who", "Detail", "IP"]}>
          {rows.map((e: OpsAuditEntry) => (
            <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={cell}>{formatTime(e.created_at)}</td>
              <td style={{ ...cell, color: e.action.endsWith("_failed") ? "var(--status-red)" : undefined }}>{e.action}</td>
              <td style={cell}>{e.admin_email ?? "-"}</td>
              <td style={{ ...cell, fontSize: 12 }}>{e.detail ?? "-"}</td>
              <td style={{ ...cell, fontSize: 12 }}>{e.ip ?? "-"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
