import type { Metadata } from "next";
import { LogoLink } from "../lib/Logo";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Glucoalarm team.",
};

export default function ContactPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <a className="btn-primary" href="/signup">
          Sign up
        </a>
      </nav>

      <div className="content-page">
        <h1>Contact us</h1>
        <p className="meta">Support will reply within 24 hours.</p>

        <h2>Support</h2>
        <p>
          Already a customer? The fastest way to reach us is the support ticket form in your{" "}
          <a href="/dashboard">dashboard</a>.
        </p>
        <p>
          Email: <a href="mailto:support@flowlog.dev">support@flowlog.dev</a>
        </p>

        <h2>Billing questions</h2>
        <p>
          For billing, refunds, or cancellations, see our <a href="/refund-policy">refund policy</a>{" "}
          or manage your subscription directly from Settings once logged in.
        </p>

        <h2>Not a medical emergency line</h2>
        <p>
          Glucoalarm is a notification tool, not a monitored medical service. If someone is
          experiencing a medical emergency, contact local emergency services directly rather than
          this form.
        </p>
      </div>
    </div>
  );
}
