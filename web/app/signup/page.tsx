"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogoLink } from "../lib/Logo";
import { startSignupCheckout } from "../lib/api";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export default function SignupPage() {
  const t = useTranslations("signup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubscribe() {
    setError(null);
    setLoading(true);
    try {
      const { url } = await startSignupCheckout();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
      setLoading(false);
    }
  }

  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <LanguageSwitcher />
          <a className="btn-primary" href="/login">
            {t("login")}
          </a>
        </div>
      </nav>

      <section style={{ maxWidth: 480, margin: "3rem auto", padding: "0 1.5rem" }}>
        <h1>{t("title")}</h1>
        <p className="meta">{t("subtitle")}</p>

        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>{t("planName")}</h3>
          <p style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0" }}>
            $59.99<span style={{ fontSize: "1rem", fontWeight: 400 }}> {t("priceSuffix")}</span>
          </p>
          <p className="meta" style={{ margin: "0 0 1rem" }}>
            {t("trialNote")}
          </p>
          <ul style={{ paddingLeft: "1.2rem", lineHeight: 1.8 }}>
            <li>{t("feature1")}</li>
            <li>{t("feature2")}</li>
            <li>{t("feature3")}</li>
            <li>{t("feature4")}</li>
          </ul>
          <button className="btn-primary" onClick={onSubscribe} disabled={loading} style={{ width: "100%", marginTop: "1rem" }}>
            {loading ? t("subscribing") : t("subscribe")}
          </button>
          <p className="meta" style={{ margin: "1rem 0", textAlign: "center" }}>{t("or")}</p>
          <a className="btn-secondary" href="/api/auth/google/start?intent=signup" style={{ display: "block", textAlign: "center", width: "100%" }}>
            {t("googleSignup")}
          </a>
          {error && <p className="meta">{error}</p>}
        </div>

        <p className="meta" style={{ marginTop: "1.5rem" }}>
          {t.rich("disclaimer", {
            refundPolicy: (chunks) => <a href="/refund-policy">{chunks}</a>,
            terms: (chunks) => <a href="/terms">{chunks}</a>,
          })}
        </p>
      </section>
    </div>
  );
}
