import { Logo } from "./lib/Logo";

export default function MarketingPage() {
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

      <section className="marketing-hero">
        <div className="hero-copy">
          <h1>Glucose alerts that reach you before it&apos;s urgent.</h1>
          <p>
            Live Dexcom readings for two people, sent to WhatsApp the moment glucose leaves the
            safe range so nothing gets missed.
          </p>
          <a className="btn-primary" href="/login">
            Log in
          </a>
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
            Example trace across a safe, high, and low reading
          </p>
        </div>
      </section>

      <section className="steps">
        <div className="step">
          <span className="step-num">1</span>
          <h3>Connect Dexcom</h3>
          <p>Enter your Dexcom Share login once. Readings start flowing in under a minute.</p>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <h3>Set your ranges</h3>
          <p>Choose the safe range and critical cutoffs for each person, in mg/dL.</p>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <h3>Get alerted on WhatsApp</h3>
          <p>
            Messages arrive at the pace the number calls for: none in range, every five minutes
            in a low or high, every minute when it&apos;s critical.
          </p>
        </div>
      </section>

      <section className="features-bento">
        <div className="bento-cell tall">
          <h3>Alerts that scale with urgency</h3>
          <p>The message rate follows how far outside the safe range a reading is.</p>
          <div className="tier-bands">
            <div className="tier-band" style={{ background: "rgba(229,72,77,0.15)" }}>
              <span>Critical</span>
              <span>every 1 min</span>
            </div>
            <div className="tier-band" style={{ background: "rgba(245,165,36,0.15)" }}>
              <span>Low or high</span>
              <span>every 5 min</span>
            </div>
            <div className="tier-band" style={{ background: "rgba(47,185,106,0.15)" }}>
              <span>Safe range</span>
              <span>silent</span>
            </div>
          </div>
        </div>
        <div className="bento-cell plain">
          <h3>Two people, one dashboard</h3>
          <p>Track readings for both people side by side, each with its own thresholds.</p>
        </div>
        <div className="bento-cell plain">
          <h3>Weekly and monthly reports</h3>
          <p>See when spikes and lows tend to happen, so patterns are easy to spot and discuss.</p>
        </div>
      </section>

      <section className="safety">
        <h2>Information, not instructions.</h2>
        <p>
          Glucoalarm logs carb counts and insulin doses, and can show the math for a
          correction factor you enter yourself, as prescribed by your doctor. It does not
          calculate or suggest insulin doses. Dosing decisions stay with you and your care
          team.
        </p>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <span>Glucoalarm</span>
          <span>Support: support@flowlog.dev</span>
        </div>
      </footer>
    </div>
  );
}
