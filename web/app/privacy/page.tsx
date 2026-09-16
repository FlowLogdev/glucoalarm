import type { Metadata } from "next";
import { LogoLink } from "../lib/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Glucoalarm collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <a className="btn-primary" href="/signup">
          Sign up
        </a>
      </nav>

      <div className="content-page">
        <h1>Privacy policy</h1>
        <p className="meta">
          Placeholder draft, not yet reviewed by an attorney. Replace before taking real payment
          in a jurisdiction with specific health-data or privacy requirements (e.g. HIPAA, GDPR).
        </p>

        <h2>What we collect</h2>
        <p>
          To operate the service, Glucoalarm collects: your account email and display name; your
          Dexcom Share username and password, encrypted at rest and used only to poll your own
          glucose readings; the glucose readings themselves and any carb/insulin log entries you
          add; phone numbers and labels for the contacts you choose to receive alerts; billing
          information handled by our payment processors (Stripe for web, Apple/RevenueCat for the
          mobile app) -- we do not store your card details ourselves; and support messages you
          send us.
        </p>

        <h2>How we use it</h2>
        <p>
          Your Dexcom readings are used solely to classify glucose tiers and send the WhatsApp
          messages, SMS fallbacks, and phone calls you and your contacts configure, and to
          generate the reports and summaries shown on your dashboard. Your phone numbers are used
          only to deliver those alerts and to respond to messages or calls you or your contacts
          initiate through Glucoalarm&apos;s WhatsApp number or voice line. We do not sell your
          data or use it for advertising.
        </p>

        <h2>AI features</h2>
        <p>
          Optional features (the setup assistant, AI-generated insights, and the conversational
          WhatsApp/voice query bot) send de-identified glucose statistics -- not your name, phone
          number, or Dexcom credentials -- to Anthropic&apos;s Claude API to generate a response.
          These features are guarded against generating insulin-dosing advice and are only
          triggered by an explicit request (yours, or a message/call from one of your contacts),
          never run automatically in the background.
        </p>

        <h2>Who we share it with</h2>
        <p>
          Glucoalarm relies on service providers to operate: Dexcom (the source of your glucose
          data, via the Share credentials you provide), Twilio (WhatsApp, SMS, and phone call
          delivery), Cloudflare (hosting and database), Stripe and RevenueCat (billing), Resend
          (transactional email), Google (optional sign-in), and Anthropic (the AI features
          described above). Each processes only the data needed to perform its function for your
          account. We do not share your data with any other third party, and we do not sell it.
        </p>

        <h2>Doctor access</h2>
        <p>
          If you invite a doctor to your account, they receive read-only access to your data and
          reports. They cannot change alert settings, contacts, or billing, and can be removed by
          you at any time from Settings.
        </p>

        <h2>Data retention and deletion</h2>
        <p>
          Your data is retained for as long as your account is active. If you cancel your
          subscription or ask us to delete your account, contact{" "}
          <a href="mailto:support@flowlog.dev">support@flowlog.dev</a> and we will delete your
          Dexcom credentials, readings, logs, and contact information from our systems, other than
          what we are required to retain for billing or legal record-keeping.
        </p>

        <h2>Security</h2>
        <p>
          Dexcom credentials are encrypted at rest (AES-256-GCM) and never displayed in plaintext
          after entry. Sessions use bearer tokens issued after login and are never exposed to
          scripts running in your browser. We recommend using a unique password for your
          Glucoalarm account.
        </p>

        <h2>Children&apos;s data</h2>
        <p>
          Glucoalarm is often used by a parent or caregiver to monitor a child&apos;s glucose. The
          account holder, not the monitored person, controls the account, its contacts, and its
          data. If you are a monitored person&apos;s parent or guardian, you are responsible for
          deciding what to share and with whom.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or a request to access or delete your data:{" "}
          <a href="mailto:support@flowlog.dev">support@flowlog.dev</a>.
        </p>
      </div>
    </div>
  );
}
