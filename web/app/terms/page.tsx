import { LogoLink } from "../lib/Logo";

export default function TermsPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <a className="btn-primary" href="/signup">
          Sign up
        </a>
      </nav>

      <div className="content-page">
        <h1>Terms and conditions</h1>
        <p className="meta">
          Placeholder draft, not yet reviewed by an attorney. Replace before taking real payment.
        </p>

        <h2>What Glucoalarm is</h2>
        <p>
          Glucoalarm is a notification tool that polls a customer-provided Dexcom Share account
          and relays glucose readings via WhatsApp and phone calls to contacts the customer
          designates. It is not a medical device, does not provide medical advice, and does not
          calculate or suggest insulin dosing.
        </p>

        <h2>Your Dexcom account</h2>
        <p>
          You are responsible for the accuracy of the Dexcom Share credentials you provide and
          for keeping your contact list current. Glucoalarm depends on Dexcom&apos;s own service
          availability and is not responsible for gaps caused by Dexcom, your phone, or your
          carrier.
        </p>

        <h2>Subscription and billing</h2>
        <p>
          Subscriptions include a 7-day free trial. Your payment method is charged automatically
          when the trial ends unless you cancel first, and monthly thereafter until you cancel.
          See our <a href="/refund-policy">refund policy</a> for details.
        </p>

        <h2>No warranty of uninterrupted service</h2>
        <p>
          Glucoalarm relies on third-party services (Dexcom, Twilio, Cloudflare) that can
          experience outages outside our control. We do not guarantee uninterrupted delivery of
          alerts and recommend keeping Dexcom&apos;s own app as your primary monitoring tool.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Glucoalarm and its operators are not liable for
          indirect, incidental, or consequential damages arising from use of the service,
          including delayed or missed alerts.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms: <a href="mailto:support@flowlog.dev">support@flowlog.dev</a>.
        </p>
      </div>
    </div>
  );
}
