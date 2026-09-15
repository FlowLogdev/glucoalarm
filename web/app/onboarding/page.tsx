"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding.account");
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
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">{t("intro")}</p>
      <label>
        {t("nameLabel")}
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <label>
        {t("emailLabel")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        {t("passwordLabel")}
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
        {loading ? t("submitting") : t("submit")}
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
  const t = useTranslations("onboarding.accountGoogle");
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
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">{t("intro")}</p>
      <label>
        {t("nameLabel")}
        <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t("submitting") : t("submit")}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function DexcomStep({ onDone }: { onDone: (personId: string) => void }) {
  const t = useTranslations("onboarding.dexcom");
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
        setError(t("errorAuth"));
      } else {
        setError(t("errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">{t("intro")}</p>
      <label>
        {t("nameLabel")}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        {t("usernameLabel")}
        <input type="text" value={dexcomUsername} onChange={(e) => setDexcomUsername(e.target.value)} required />
      </label>
      <label>
        {t("passwordLabel")}
        <input
          type="password"
          value={dexcomPassword}
          onChange={(e) => setDexcomPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t("submitting") : t("submit")}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function ContactsStep({ personId, onDone }: { personId: string; onDone: () => void }) {
  const t = useTranslations("onboarding.contacts");
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
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">{t("intro")}</p>
      {numbers.map((n, i) => (
        <div key={i} style={{ marginBottom: "1rem" }}>
          <label>
            {t("phoneLabel", { index: i + 1 })}
            <input
              type="tel"
              value={n.phone}
              onChange={(e) => updateNumber(i, "phone", e.target.value)}
              placeholder="+13055551234"
            />
          </label>
          <label>
            {t("labelLabel")}
            <input type="text" value={n.label} onChange={(e) => updateNumber(i, "label", e.target.value)} placeholder={t("labelPlaceholder")} />
          </label>
        </div>
      ))}
      {numbers.length < 2 && (
        <button type="button" onClick={() => setNumbers((prev) => [...prev, { phone: "", label: "" }])}>
          {t("addSecond")}
        </button>
      )}
      <div style={{ marginTop: "1rem" }}>
        <button type="submit" disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </button>
      </div>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

const TICKER_OPTIONS = [5, 8, 10, 15, 20, 30, 60];

function ThresholdsStep({ personId, onDone }: { personId: string; onDone: () => void }) {
  const t = useTranslations("onboarding.thresholds");
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
      setError(t("errorOrder"));
      return;
    }
    setLoading(true);
    try {
      await updateThresholds(personId, safeLow, safeHigh, criticalLow, criticalHigh, 20);
      await updateTickerInterval(personId, tickerMinutes);
      onDone();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="meta">{t("intro")}</p>
      <label>
        {t("criticalLowLabel")}
        <input type="number" value={criticalLow} onChange={(e) => setCriticalLow(Number(e.target.value))} required />
      </label>
      <label>
        {t("safeLowLabel")}
        <input type="number" value={safeLow} onChange={(e) => setSafeLow(Number(e.target.value))} required />
      </label>
      <label>
        {t("safeHighLabel")}
        <input type="number" value={safeHigh} onChange={(e) => setSafeHigh(Number(e.target.value))} required />
      </label>
      <label>
        {t("criticalHighLabel")}
        <input type="number" value={criticalHigh} onChange={(e) => setCriticalHigh(Number(e.target.value))} required />
      </label>
      <label>
        {t("tickerLabel")}
        <select value={tickerMinutes} onChange={(e) => setTickerMinutes(Number(e.target.value))}>
          {TICKER_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {t("tickerMinutes", { minutes: m })}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={loading}>
        {loading ? t("submitting") : t("submit")}
      </button>
      {error && <p className="meta">{error}</p>}
    </form>
  );
}

function OnboardingFlow() {
  const t = useTranslations("onboarding");
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
    return <p className="meta">{t("loading")}</p>;
  }

  if (resumeError) {
    return (
      <p className="meta">
        {t.rich("missingSession", {
          login: (chunks) => <a href="/login">{chunks}</a>,
          signup: (chunks) => <a href="/signup">{chunks}</a>,
        })}
      </p>
    );
  }

  return (
    <section style={{ maxWidth: 480, margin: "3rem auto", padding: "0 1.5rem" }}>
      <h1>{t("title")}</h1>
      <p className="meta">
        {t("stepOf", { current: ["account", "dexcom", "contacts", "thresholds"].indexOf(step) + 1, total: 4 })}
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
