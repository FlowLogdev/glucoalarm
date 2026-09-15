import type { Env } from "./types";

type BillingSource = "stripe" | "revenuecat";

function isActive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/** A customer may subscribe on web or in either native store. */
export async function setSubscriptionSourceStatus(
  env: Env, customerId: string, source: BillingSource, status: string, expiresAt: number | null = null
): Promise<{ changed: boolean; status: string } | null> {
  const current = await env.DB.prepare(
    `SELECT subscription_status, stripe_subscription_status, revenuecat_subscription_status, revenuecat_expires_at FROM customers WHERE id = ?`
  ).bind(customerId).first<{ subscription_status: string; stripe_subscription_status: string | null; revenuecat_subscription_status: string | null; revenuecat_expires_at: number | null }>();
  if (!current) return null;
  const stripeStatus = source === "stripe" ? status : current.stripe_subscription_status;
  const revenueCatStatus = source === "revenuecat" ? status : current.revenuecat_subscription_status;
  const effectiveStatus = isActive(stripeStatus) || isActive(revenueCatStatus) ? "active" : status;
  await env.DB.prepare(
    `UPDATE customers SET stripe_subscription_status = ?, revenuecat_subscription_status = ?, revenuecat_expires_at = ?, subscription_status = ? WHERE id = ?`
  ).bind(stripeStatus, revenueCatStatus ?? "inactive", source === "revenuecat" ? expiresAt : current.revenuecat_expires_at, effectiveStatus, customerId).run();
  return { changed: current.subscription_status !== effectiveStatus, status: effectiveStatus };
}
