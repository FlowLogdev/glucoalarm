import { verifyStripeSignature } from "./lib/stripe";
import { sendWhatsApp, billingAlertVariables } from "./lib/whatsapp";
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
 * One-time alert on a genuine transition into/out of "active", not on
 * every webhook delivery (Stripe retries) or every status wobble between
 * past_due/canceled, which are both already "not active".
 */
async function notifyCustomerOfStatusChange(env: Env, customerId: string, newStatus: string, now: number): Promise<void> {
  const people = await env.DB
    .prepare(`SELECT id, name, timezone FROM people WHERE customer_id = ?`)
    .bind(customerId)
    .all<{ id: string; name: string; timezone: string | null }>();
  if (people.results.length === 0) return;

  const label =
    newStatus === "active"
      ? "✅ MONITORING RESUMED"
      : "⚠️ BILLING ISSUE - Monitoring paused";

  for (const person of people.results) {
    const subscribers = await env.DB
      .prepare(`SELECT phone_number FROM phone_subscribers WHERE person_id = ?`)
      .bind(person.id)
      .all<{ phone_number: string }>();
    if (subscribers.results.length === 0) continue;

    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: person.timezone ?? "UTC",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(now * 1000));
    const variables = billingAlertVariables(person.name, label, time);

    for (const sub of subscribers.results) {
      try {
        await sendWhatsApp(sub.phone_number, variables, env);
      } catch (err) {
        console.error(`notifyCustomerOfStatusChange: sendWhatsApp failed for ${person.id} -> ${sub.phone_number}:`, err);
      }
    }
  }
}

/**
 * Public webhook (Stripe can't carry our bearer token, so it's verified via
 * Stripe's own request signature instead -- same pattern as the Twilio call
 * webhook, see src/lib/twilio-verify.ts). Flips a customer's
 * subscription_status so pollAll() stops polling/messaging/calling for
 * anyone who has stopped paying, without deleting their data. Also sends a
 * one-time WhatsApp alert on a real transition into or out of "active", so
 * a lapsed payment doesn't silently stop monitoring with nobody notified.
 */
export async function handleStripeWebhook(request: Request, env: Env, now: number): Promise<Response> {
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
    const newStatus = event.type === "customer.subscription.deleted" ? "canceled" : sub.status === "active" ? "active" : "past_due";

    const existing = await env.DB
      .prepare(`SELECT id, subscription_status FROM customers WHERE stripe_subscription_id = ?`)
      .bind(sub.id)
      .first<{ id: string; subscription_status: string }>();
    if (!existing) {
      console.error(`handleStripeWebhook: no customer found for subscription ${sub.id}`);
      return jsonResponse({ received: true });
    }

    if (existing.subscription_status !== newStatus) {
      await env.DB.prepare(`UPDATE customers SET subscription_status = ? WHERE id = ?`).bind(newStatus, existing.id).run();

      const wasActive = existing.subscription_status === "active";
      const isActive = newStatus === "active";
      if (wasActive !== isActive) {
        await notifyCustomerOfStatusChange(env, existing.id, newStatus, now);
      }
    }
  }

  return jsonResponse({ received: true });
}
