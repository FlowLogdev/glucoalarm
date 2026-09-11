"use client";

import { useEffect, useState } from "react";
import { getBilling, getCurrentAdmin, openBillingPortal, type BillingInfo, type CurrentAdmin } from "../../lib/api";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
};

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [admin, setAdmin] = useState<CurrentAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getBilling()
      .then(setBilling)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);
  useEffect(() => {
    getCurrentAdmin()
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  const readOnly = admin?.role === "doctor";

  async function onManage() {
    setError(null);
    setLoading(true);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open billing portal");
      setLoading(false);
    }
  }

  return (
    <>
      <h1>Billing</h1>
      {error && <p className="meta">{error}</p>}
      {!billing && !error && <p className="meta">Loading...</p>}
      {billing && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3 style={{ marginTop: 0 }}>{billing.display_name}</h3>
          <p>
            Status: <strong>{STATUS_LABELS[billing.subscription_status] ?? billing.subscription_status}</strong>
          </p>
          <p className="meta">$59.99/month, first 7 days free.</p>
          {readOnly ? (
            <p className="meta">Read-only access -- billing can only be managed by the account owner.</p>
          ) : billing.has_billing_account ? (
            <button onClick={onManage} disabled={loading}>
              {loading ? "Opening..." : "Manage subscription"}
            </button>
          ) : (
            <p className="meta">No billing account on file for this internal account.</p>
          )}
        </div>
      )}
    </>
  );
}
