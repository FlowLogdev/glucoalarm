import type { Env } from "../types";

export class StripeError extends Error {}

/**
 * Raw fetch calls to Stripe's REST API (no SDK -- same approach already
 * used for Twilio in this project; Stripe's Node SDK doesn't run natively
 * on Workers without polyfills).
 */
export async function createCheckoutSession(
  env: Env,
  successUrl: string,
  cancelUrl: string,
  customerEmail?: string
): Promise<{ id: string; url: string }> {
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "7",
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  // Prefills and locks the email field for Google-originated signups,
  // where we've already verified the address via Google -- ordinary
  // signups leave this unset and let the customer type it in Checkout.
  if (customerEmail) params.set("customer_email", customerEmail);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.STRIPE_SECRET_KEY}:`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new StripeError(`Stripe checkout session creation failed (${res.status}): ${text}`);
  }

  const data = await res.json<{ id: string; url: string }>();
  return { id: data.id, url: data.url };
}

export async function createPortalSession(env: Env, stripeCustomerId: string, returnUrl: string): Promise<{ url: string }> {
  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.STRIPE_SECRET_KEY}:`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ customer: stripeCustomerId, return_url: returnUrl }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new StripeError(`Stripe portal session creation failed (${res.status}): ${text}`);
  }
  return res.json<{ url: string }>();
}

export interface StripeCheckoutSession {
  id: string;
  payment_status: string;
  customer: string | null;
  subscription: string | null;
}

export async function retrieveCheckoutSession(env: Env, sessionId: string): Promise<StripeCheckoutSession | null> {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: "Basic " + btoa(`${env.STRIPE_SECRET_KEY}:`) },
  });
  if (!res.ok) return null;
  return res.json<StripeCheckoutSession>();
}

/**
 * Verifies Stripe's webhook signature (Stripe-Signature header: comma-
 * separated `t=<timestamp>,v1=<hmac>`), same pattern as
 * src/lib/twilio-verify.ts -- HMAC-SHA256 over `${timestamp}.${rawBody}`.
 */
export async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const computed = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computed.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
