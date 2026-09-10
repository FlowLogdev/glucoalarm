"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createTicket,
  getTicket,
  getTickets,
  replyToTicket,
  type SupportTicket,
  type SupportTicketMessage,
} from "../../lib/api";

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NewTicketForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { id } = await createTicket(subject, message);
      setSubject("");
      setMessage("");
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Subject
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </label>
      <label>
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          required
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "0.5rem 0.6rem",
            color: "var(--text)",
            fontSize: "0.95rem",
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send"}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function TicketThread({ ticketId, onReplied }: { ticketId: number; onReplied: () => void }) {
  const [data, setData] = useState<{ ticket: SupportTicket; messages: SupportTicketMessage[] } | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function refresh() {
    getTicket(ticketId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, [ticketId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await replyToTicket(ticketId, reply);
      setReply("");
      refresh();
      onReplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setLoading(false);
    }
  }

  if (error) return <p className="meta">{error}</p>;
  if (!data) return <p className="meta">Loading...</p>;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{data.ticket.subject}</h3>
      <p className="meta">Status: {data.ticket.status}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", margin: "1rem 0" }}>
        {data.messages.map((m) => (
          <div
            key={m.id}
            className="card"
            style={{
              background: m.is_staff ? "var(--panel)" : "var(--bg)",
              alignSelf: m.is_staff ? "flex-start" : "flex-end",
              maxWidth: "80%",
            }}
          >
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.body}</p>
            <p className="meta" style={{ margin: "0.4rem 0 0" }}>
              {m.is_staff ? "Support" : "You"} &middot; {formatDate(m.created_at)}
            </p>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <label>
          Reply
          <input type="text" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply..." />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Reply"}
        </button>
      </form>
    </div>
  );
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    getTickets()
      .then((t) => {
        setTickets(t);
        if (t.length && selected == null) setSelected(t[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }

  useEffect(refresh, []);

  return (
    <>
      <h1>Support</h1>
      {error && <p className="meta">{error}</p>}
      <div className="card-grid" style={{ gridTemplateColumns: "280px 1fr", alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Your tickets</h3>
          {tickets?.length === 0 && <p className="meta">No tickets yet.</p>}
          {tickets?.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelected(t.id)}
              style={{
                cursor: "pointer",
                padding: "0.5rem 0",
                borderBottom: "1px solid var(--border)",
                fontWeight: t.id === selected ? 700 : 400,
              }}
            >
              {t.subject}
              <div className="meta">
                {t.status} &middot; {formatDate(t.updated_at)}
              </div>
            </div>
          ))}
          <div style={{ marginTop: "1.5rem" }}>
            <h3>New ticket</h3>
            <NewTicketForm
              onCreated={(id) => {
                refresh();
                setSelected(id);
              }}
            />
          </div>
        </div>

        <div className="card">
          {selected ? (
            <TicketThread ticketId={selected} onReplied={refresh} />
          ) : (
            <p className="meta">Select a ticket, or start a new one.</p>
          )}
        </div>
      </div>
    </>
  );
}
