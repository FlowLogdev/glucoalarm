"use client";

import { useState } from "react";
import { Logo } from "../lib/Logo";
import { startSignupCheckout } from "../lib/api";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubscribe() {
    setError(null);
    setLoading(true);
    try {
      const { url } = await startSignupCheckout();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setLoading(false);
    }
  }

  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <a className="brand" href="/" style={{ display: "inline-flex" }}>
          <Logo size={26} />
        </a>
        <a className="btn-primary" href="/login">
          Log in
        </a>
      </nav>

      <section style={{ maxWidth: 480, margin: "3rem auto", padding: "0 1.5rem" }}>
        <h1>Start monitoring today</h1>
        <p className="meta">
          One flat monthly price. Connect your own Dexcom Share account, add up to two phone
          numbers, and start receiving WhatsApp alerts and low-glucose phone calls within
          minutes.
        </p>

        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Glucoalarm</h3>
          <p style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0" }}>
            $39<span style={{ fontSize: "1rem", fontWeight: 400 }}> / month</span>
          </p>
          <ul style={{ paddingLeft: "1.2rem", lineHeight: 1.8 }}>
            <li>One monitored person, connected via Dexcom Share</li>
            <li>WhatsApp alerts for lows, highs, and safe-range check-ins</li>
            <li>Low-glucose phone call escalation, up to two contacts</li>
            <li>Configurable thresholds and update cadence</li>
          </ul>
          <button className="btn-primary" onClick={onSubscribe} disabled={loading} style={{ width: "100%", marginTop: "1rem" }}>
            {loading ? "Starting checkout..." : "Subscribe"}
          </button>
          {error && <p className="meta">{error}</p>}
        </div>

        <p className="meta" style={{ marginTop: "1.5rem" }}>
          Glucoalarm is a notification tool, not a medical device. It does not calculate or
          suggest insulin doses. After payment, you&apos;ll set up your account and connect
          Dexcom in a few short steps.
        </p>
      </section>
    </div>
  );
}
