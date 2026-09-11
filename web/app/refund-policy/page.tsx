import { LogoLink } from "../lib/Logo";

export default function RefundPolicyPage() {
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <LogoLink />
        <a className="btn-primary" href="/signup">
          Sign up
        </a>
      </nav>

      <div className="content-page">
        <h1>Refund policy</h1>
        <p className="meta">
          Placeholder draft, not yet reviewed by an attorney. Replace before taking real payment.
        </p>

        <h2>Free trial</h2>
        <p>
          Every subscription starts with a 7-day free trial. Cancel any time during the trial
          from Settings and you will not be charged.
        </p>

        <h2>After the trial</h2>
        <p>
          Once the trial ends, your card is charged $59.99 and billed monthly until you cancel.
          Charges already processed are non-refundable except as described below.
        </p>

        <h2>Cancellations</h2>
        <p>
          Cancel any time from Settings. Monitoring continues until the end of the billing period
          you already paid for; you will not be charged again after canceling.
        </p>

        <h2>Exceptions</h2>
        <p>
          If Glucoalarm experiences an extended outage on our side that materially prevented
          alerts from being delivered, contact <a href="/contact">support</a> and we will review
          a prorated refund for the affected period.
        </p>
      </div>
    </div>
  );
}
