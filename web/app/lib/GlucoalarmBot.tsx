"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { sendSetupAssistantMessage, type AssistantMessage } from "./api";

const GREETING: AssistantMessage = {
  role: "assistant",
  content:
    "Hi, I'm Glucoalarm BOT. Ask me about connecting Dexcom, alert phone numbers, thresholds, check-in cadence, billing, how alerts work, or how to read your reports. I can't help with insulin dosing or general medical questions -- for those, talk to your care team or open a support ticket.",
};

export function GlucoalarmBot({ title = "Glucoalarm BOT", subtitle = "Ask a question" }: { title?: string; subtitle?: string }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const { reply } = await sendSetupAssistantMessage(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the assistant. Try again.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="setup-bot">
      <div className="setup-bot-header">
        <span className="setup-bot-avatar" aria-hidden="true">
          🤖
        </span>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="meta" style={{ margin: 0 }}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="setup-bot-chat">
        {messages.map((m, i) => (
          <div key={i} className={`setup-bot-bubble setup-bot-bubble-${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="setup-bot-bubble setup-bot-bubble-assistant">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What does my time-in-range mean?"
            disabled={loading}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
        {error && <p className="meta">{error}</p>}
      </form>

      <p className="meta" style={{ marginTop: "0.75rem" }}>
        See the full <a href="/docs" target="_blank" rel="noreferrer">documentation</a> or{" "}
        <a href="/support">open a support ticket</a>.
      </p>
    </aside>
  );
}
