import { verifyStripeSignature } from "./lib/stripe";
import type { Env } from "./types";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

interface StripeEvent {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      status?: string;
    };
  };
}

/**
 * Public webhook (Stripe can't carry our bearer token, so it's verified via
 * Stripe's own request signature instead -- same pattern as the Twilio call
 * webhook, see src/lib/twilio-verify.ts). Flips a customer's
 * subscription_status so pollAll() stops polling/messaging/calling for
 * anyone who has stopped paying, without deleting their data.
 */
export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature");

  const valid = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error("handleStripeWebhook: invalid Stripe signature");
    return jsonResponse({ error: "invalid_signature" }, 403);
  }

  const event = JSON.parse(payload) as StripeEvent;

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status === "active" ? "active" : "past_due";
    const result = await env.DB
      .prepare(`UPDATE customers SET subscription_status = ? WHERE stripe_subscription_id = ?`)
      .bind(status, sub.id)
      .run();
    if (result.meta.changes === 0) {
      console.error(`handleStripeWebhook: no customer found for subscription ${sub.id}`);
    }
  }

  return jsonResponse({ received: true });
}
