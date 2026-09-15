import { useTranslations } from "next-intl";
import { LogoLink } from "./lib/Logo";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Glucoalarm",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description:
    "Glucose alerts that reach you before it's urgent. Connect your own Dexcom Share account and get WhatsApp alerts the moment glucose leaves the safe range, plus phone call escalation for lows.",
  offers: {
    "@type": "Offer",
    price: "59.99",
    priceCurrency: "USD",
    priceValidUntil: "2027-12-31",
    availability: "https://schema.org/InStock",
  },
};

export default function MarketingPage() {
  const t = useTranslations("marketing");
  return (
    <div className="marketing">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <nav className="marketing-nav">
        <LogoLink isHomePage />
        <div className="marketing-nav-links">
          <a href="/signup">{t("nav.pricing")}</a>
          <a href="/docs">{t("nav.docs")}</a>
          <a href="/support">{t("nav.support")}</a>
          <a href="/contact">{t("nav.contact")}</a>
        </div>
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <LanguageSwitcher />
          <a href="/login" style={{ color: "var(--text-dim)", fontSize: "0.9rem", textDecoration: "none" }}>
            {t("nav.login")}
          </a>
          <a className="btn-primary" href="/signup">
            {t("nav.signup")}
          </a>
        </div>
      </nav>

      <section className="marketing-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">{t("hero.eyebrow")}</span>
          <h1>{t("hero.title")}</h1>
          <p>{t("hero.body")}</p>
          <div className="hero-actions">
            <a className="btn-primary" href="/signup">
              {t("hero.cta")}
            </a>
          </div>
        </div>

        <div className="hero-visual">
          <svg viewBox="0 0 400 240" role="img" aria-label="Example glucose trace across safe, high, and low readings">
            <rect x="0" y="0" width="400" height="36" fill="var(--status-red)" opacity="0.12" />
            <rect x="0" y="36" width="400" height="36" fill="var(--status-orange)" opacity="0.12" />
            <rect x="0" y="72" width="400" height="96" fill="var(--status-green)" opacity="0.12" />
            <rect x="0" y="168" width="400" height="36" fill="var(--status-orange)" opacity="0.12" />
            <rect x="0" y="204" width="400" height="36" fill="var(--status-red)" opacity="0.12" />

            <polyline
              points="0,140 40,130 80,110 120,150 160,190 200,175 240,130 280,90 320,110 360,140 400,135"
              fill="none"
              stroke="var(--text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle className="trace-dot" cx="400" cy="135" r="5" fill="var(--status-green)" />
          </svg>
          <p className="meta" style={{ marginTop: "0.75rem" }}>
            {t("hero.traceCaption")}
          </p>
        </div>
      </section>

      <div className="trust-strip">
        <span>{t("trustStrip.trial")}</span>
        <span>{t("trustStrip.cancel")}</span>
        <span>{t("trustStrip.credentials")}</span>
      </div>

      <section className="steps">
        <div className="step">
          <span className="step-num">1</span>
          <h3>{t("steps.title1")}</h3>
          <p>{t("steps.body1")}</p>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <h3>{t("steps.title2")}</h3>
          <p>{t("steps.body2")}</p>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <h3>{t("steps.title3")}</h3>
          <p>{t("steps.body3")}</p>
        </div>
      </section>

      <section className="features-bento">
        <div className="bento-cell tall">
          <h3>{t("features.scaleTitle")}</h3>
          <p>{t("features.scaleBody")}</p>
          <div className="tier-bands">
            <div className="tier-band" style={{ background: "rgba(229,72,77,0.15)" }}>
              <span>{t("features.tierCritical")}</span>
              <span>{t("features.tierCriticalRate")}</span>
            </div>
            <div className="tier-band" style={{ background: "rgba(245,165,36,0.15)" }}>
              <span>{t("features.tierLowHigh")}</span>
              <span>{t("features.tierLowHighRate")}</span>
            </div>
            <div className="tier-band" style={{ background: "rgba(47,185,106,0.15)" }}>
              <span>{t("features.tierSafe")}</span>
              <span>{t("features.tierSafeRate")}</span>
            </div>
          </div>
        </div>
        <div className="bento-cell plain">
          <h3>{t("features.setupTitle")}</h3>
          <p>{t("features.setupBody")}</p>
        </div>
        <div className="bento-cell plain">
          <h3>{t("features.reportsTitle")}</h3>
          <p>{t("features.reportsBody")}</p>
        </div>
      </section>

      <section className="safety">
        <h2>{t("safety.title")}</h2>
        <p>{t("safety.body")}</p>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <span>Glucoalarm</span>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <a href="/login">{t("footer.login")}</a>
            <a href="/signup">{t("footer.pricing")}</a>
            <a href="/docs">{t("footer.docs")}</a>
            <a href="/support">{t("footer.support")}</a>
            <a href="/contact">{t("footer.contact")}</a>
            <a href="/terms">{t("footer.terms")}</a>
            <a href="/refund-policy">{t("footer.refunds")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
