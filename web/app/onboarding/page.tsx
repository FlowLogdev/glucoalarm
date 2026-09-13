"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addSubscriber,
  checkLoggedIn,
  completeSignup,
  completeSignupGoogle,
  connectDexcom,
  getPeople,
  updateThresholds,
  updateTickerInterval,
} from "../lib/api";

type Step = "account" | "dexcom" | "contacts" | "thresholds";

function AccountStep({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await completeSignup(sessionId, displayName, email, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">Payment confirmed. Set up your account to continue.</p>
      <label>
        Your name or household name
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        Password (at least 8 characters)
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Creating account..." : "Continue"}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

/** Google-originated signup: email is already verified by Google, so this
 *  step only needs the household display name before the account is
 *  created (see postSignupCompleteGoogle in src/signup.ts). */
function AccountStepGoogle({
  sessionId,
  googleToken,
  onDone,
}: {
  sessionId: string;
  googleToken: string;
  onDone: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await completeSignupGoogle(sessionId, googleToken, displayName);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">Payment confirmed. Signed in with Google -- just name your account to continue.</p>
      <label>
        Your name or household name
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Creating account..." : "Continue"}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function DexcomStep({ onDone }: { onDone: (personId: string) => void }) {
  const [name, setName] = useState("");
  const [dexcomUsername, setDexcomUsername] = useState("");
  const [dexcomPassword, setDexcomPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { id } = await connectDexcom(name, dexcomUsername, dexcomPassword);
      onDone(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("dexcom_authentication_failed")) {
        setError("Those Dexcom credentials didn't work. Double-check the username and password and try again.");
      } else {
        setError("Couldn't connect to Dexcom. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">
        Connect the Dexcom Share account for the person being monitored. This is the same login
        used in the Dexcom mobile app -- Glucoalarm polls it the same way Dexcom Follow does.
      </p>
      <label>
        Name of the person being monitored
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Dexcom Share username
        <input type="text" value={dexcomUsername} onChange={(e) => setDexcomUsername(e.target.value)} required />
      </label>
      <label>
        Dexcom Share password
        <input
          type="password"
          value={dexcomPassword}
          onChange={(e) => setDexcomPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Verifying with Dexcom..." : "Connect Dexcom"}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function ContactsStep({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [numbers, setNumbers] = useState<{ phone: string; label: string }[]>([{ phone: "", label: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateNumber(i: number, field: "phone" | "label", value: string) {
    setNumbers((prev) => prev.map((n, idx) => (idx === i ? { ...n, [field]: value } : n)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const filled = numbers.filter((n) => n.phone.trim());
      for (const n of filled) {
        await addSubscriber(personId, n.phone.trim(), n.label.trim());
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save phone numbers");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">Up to two phone numbers can receive alerts for this person -- nobody else.</p>
      {numbers.map((n, i) => (
        <div key={i} style={{ marginBottom: "1rem" }}>
          <label>
            Phone number {i + 1} (E.164, e.g. +13055551234)
            <input
              type="tel"
              value={n.phone}
              onChange={(e) => updateNumber(i, "phone", e.target.value)}
              placeholder="+13055551234"
            />
          </label>
          <label>
            Label (optional)
            <input type="text" value={n.label} onChange={(e) => updateNumber(i, "label", e.target.value)} placeholder="Mom's phone" />
          </label>
        </div>
      ))}
      {numbers.length < 2 && (
        <button type="button" onClick={() => setNumbers((prev) => [...prev, { phone: "", label: "" }])}>
          Add a second number
        </button>
      )}
      <div style={{ marginTop: "1rem" }}>
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Continue"}
        </button>
      </div>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

const TICKER_OPTIONS = [5, 8, 10, 15, 20, 30, 60];

function ThresholdsStep({ personId, onDone }: { personId: string; onDone: () => void }) {
  const [criticalLow, setCriticalLow] = useState(70);
  const [safeLow, setSafeLow] = useState(96);
  const [safeHigh, setSafeHigh] = useState(200);
  const [criticalHigh, setCriticalHigh] = useState(250);
  const [tickerMinutes, setTickerMinutes] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (criticalLow >= safeLow || safeLow >= safeHigh || safeHigh >= criticalHigh) {
      setError("Thresholds must satisfy: critical low < safe low < safe high < critical high");
      return;
    }
    setLoading(true);
    try {
      await updateThresholds(personId, safeLow, safeHigh, criticalLow, criticalHigh, 20);
      await updateTickerInterval(personId, tickerMinutes);
      onDone();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">
        Set your alert ranges in mg/dL, and how often you want a check-in message while glucose
        is in the safe range. You can change these anytime in Settings.
      </p>
      <label>
        Critical low -- below this, phone calls repeat every 5 min until acknowledged
        <input type="number" value={criticalLow} onChange={(e) => setCriticalLow(Number(e.target.value))} required />
      </label>
      <label>
        Safe range low
        <input type="number" value={safeLow} onChange={(e) => setSafeLow(Number(e.target.value))} required />
      </label>
      <label>
        Safe range high
        <input type="number" value={safeHigh} onChange={(e) => setSafeHigh(Number(e.target.value))} required />
      </label>
      <label>
        Critical high
        <input type="number" value={criticalHigh} onChange={(e) => setCriticalHigh(Number(e.target.value))} required />
      </label>
      <label>
        Safe-range check-in every
        <select value={tickerMinutes} onChange={(e) => setTickerMinutes(Number(e.target.value))}>
          {TICKER_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Finishing setup..." : "Finish setup"}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function OnboardingFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const sessionId = params.get("session_id");
  const googleToken = params.get("google_token");
  const [step, setStep] = useState<Step>(sessionId ? "account" : "dexcom");
  const [personId, setPersonId] = useState<string | null>(null);
  // Undetermined until the resume check (or lack of one) resolves, so we
  // don't flash the "missing session" message for a logged-in customer
  // resuming an abandoned signup.
  const [resumeChecked, setResumeChecked] = useState(!!sessionId);
  const [resumeError, setResumeError] = useState(false);

  useEffect(() => {
    if (sessionId) return; // fresh post-checkout flow, nothing to resume
    checkLoggedIn().then(async (loggedIn) => {
      if (!loggedIn) {
        setResumeError(true);
        setResumeChecked(true);
        return;
      }
      // Already has a monitored person connected -- onboarding's job is
      // done; Settings covers everything from here.
      const people = await getPeople().catch(() => []);
      if (people.length > 0) {
        router.replace("/dashboard");
        return;
      }
      setResumeChecked(true);
    });
  }, [sessionId, router]);

  if (!resumeChecked) {
    return <p className="meta">Loading...</p>;
  }

  if (resumeError) {
    return (
      <p className="meta">
        Missing checkout session. <a href="/login">Log in</a> to resume a signup already in
        progress, or start over from <a href="/signup">signup</a>.
      </p>
    );
  }

  return (
    <section style={{ maxWidth: 480, margin: "3rem auto", padding: "0 1.5rem" }}>
      <h1>Set up Glucoalarm</h1>
      <p className="meta">
        Step {["account", "dexcom", "contacts", "thresholds"].indexOf(step) + 1} of 4
      </p>
      <div className="card">
        {step === "account" && sessionId && googleToken && (
          <AccountStepGoogle sessionId={sessionId} googleToken={googleToken} onDone={() => setStep("dexcom")} />
        )}
        {step === "account" && sessionId && !googleToken && (
          <AccountStep sessionId={sessionId} onDone={() => setStep("dexcom")} />
        )}
        {step === "dexcom" && (
          <DexcomStep
            onDone={(id) => {
              setPersonId(id);
              setStep("contacts");
            }}
          />
        )}
        {step === "contacts" && personId && <ContactsStep personId={personId} onDone={() => setStep("thresholds")} />}
        {step === "thresholds" && personId && <ThresholdsStep personId={personId} onDone={() => {}} />}
      </div>
    </section>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingFlow />
    </Suspense>
  );
}
