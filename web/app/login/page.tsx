"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogoLink } from "../lib/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t("errorInvalid"));
        return;
      }
      router.push(params.get("next") ?? "/dashboard");
      router.refresh();
    } catch {
      setError(t("errorUnreachable"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <LogoLink />
        <div>
          <blockquote>&ldquo;{t("quote")}&rdquo;</blockquote>
          <p className="meta">{t("tagline")}</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
          <LanguageSwitcher />
        </div>
        <div>
          <h1>{t("title")}</h1>
          <p className="meta">{t("subtitle")}</p>
          <form onSubmit={onSubmit}>
            <label>
              {t("email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              {t("password")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </button>
            {error && <p className="meta">{error}</p>}
          </form>
          <p className="meta" style={{ margin: "1rem 0", textAlign: "center" }}>{t("or")}</p>
          <a className="btn-secondary" href="/api/auth/google/start?intent=login" style={{ display: "block", textAlign: "center" }}>
            {t("googleContinue")}
          </a>
          <p className="meta" style={{ marginTop: "1.5rem" }}>
            {t("newHere")} <a href="/signup">{t("startTrial")}</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
