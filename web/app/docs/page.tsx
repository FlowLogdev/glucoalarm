import type { Metadata } from "next";
import { LogoLink } from "../lib/Logo";

export const metadata: Metadata = {
  title: "Docs",
  description: "How to connect Dexcom Share, set alert thresholds, add contacts, and use Glucoalarm's WhatsApp and phone-call alerts.",
};

export default function DocsPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <a className="btn-primary" href="/signup">
          Sign up
        </a>
      </nav>

      <div className="content-page" style={{ maxWidth: 760 }}>
        <h1>Setup guide</h1>
        <p className="meta">Everything you need to get Glucoalarm running, step by step.</p>

        <h2>1. Create your account</h2>
        <p>
          Start at <a href="/signup">/signup</a> and subscribe. Your first 7 days are free and
          your card isn&apos;t charged until day 8. After checkout, you&apos;ll land on the setup
          wizard automatically.
        </p>

        <h2>2. Connect Dexcom Share</h2>
        <p>
          Use the same login you use in the Dexcom mobile app. Glucoalarm reads glucose data the
          same way Dexcom&apos;s own Follow app does, through Dexcom Share. Your password is
          encrypted before it&apos;s stored and is only ever decrypted automatically by the
          system to check your readings, never viewed by a person.
        </p>
        <p>
          If the connection fails, double-check the username and password work in the actual
          Dexcom app first. A fresh password reset there is the most reliable fix if you&apos;re
          not sure the credentials are right.
        </p>

        <h2>3. Add alert contacts</h2>
        <p>
          Add up to two phone numbers in E.164 format (country code plus number, e.g.
          +13055551234). These are the only people who receive WhatsApp alerts and phone calls
          for this account.
        </p>
        <p>
          For WhatsApp to deliver, each contact needs a phone number capable of receiving
          WhatsApp messages. No app install or account setup is required on their end beyond
          having WhatsApp itself.
        </p>

        <h2>4. Set your thresholds</h2>
        <p>
          Set critical low, safe low, safe high, and critical high in mg/dL, exactly as
          recommended by your doctor. The rule is: critical low &lt; safe low &lt; safe high
          &lt; critical high. You can change these anytime from Settings.
        </p>

        <h2>5. How alerts work</h2>
        <ul>
          <li>
            <strong>In your safe range:</strong> a periodic WhatsApp check-in at the interval you
            choose (5 to 60 minutes), so you know the system is working.
          </li>
          <li>
            <strong>Low or high, outside safe range:</strong> an immediate WhatsApp alert, then
            repeated alerts as long as it stays out of range.
          </li>
          <li>
            <strong>Critical low:</strong> phone calls to your alert contacts, in priority order,
            repeating every 5 minutes until someone presses 1 during the call to acknowledge it.
            Once acknowledged, calls stop until a new low episode starts.
          </li>
          <li>
            <strong>Dexcom signal lost or restored:</strong> a WhatsApp alert either way, so a
            dead sensor or phone battery doesn&apos;t look like silence.
          </li>
        </ul>
        <p>Glucoalarm does not call for highs, only for critical lows.</p>

        <h2>6. Manage billing</h2>
        <p>
          Visit <a href="/billing">Billing</a> once logged in to see your subscription status and
          open Stripe&apos;s billing portal, where you can update your card or cancel. Canceling
          stops future charges; you keep access through the end of the period you already paid
          for.
        </p>

        <h2>7. Get help</h2>
        <p>
          Open a ticket anytime at <a href="/support">/support</a>, whether or not you&apos;re
          logged in. You&apos;ll get a ticket number immediately and a confirmation email, and
          our team replies within 24 hours.
        </p>

        <h2>Important</h2>
        <p>
          Glucoalarm is a notification tool, not a medical device and not a monitored emergency
          service. It does not calculate or suggest insulin doses. Keep Dexcom&apos;s own app as
          your primary source of truth, and contact emergency services directly for any medical
          emergency.
        </p>
      </div>
    </div>
  );
}
