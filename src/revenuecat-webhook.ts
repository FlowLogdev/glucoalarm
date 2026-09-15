import { setSubscriptionSourceStatus } from "./subscription-status";
import type { Env } from "./types";

interface RevenueCatWebhook { event?: { type?: string; app_user_id?: string; original_app_user_id?: string; aliases?: string[]; expiration_at_ms?: number | null }; }
function jsonResponse(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"]);
const INACTIVE_EVENTS = new Set(["EXPIRATION", "BILLING_ISSUE", "CANCELLATION", "REFUND"]);

/** Native SDK uses the GlucoAlarm customer ID as appUserID, unifying login and entitlements. */
export async function handleRevenueCatWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.REVENUECAT_WEBHOOK_AUTHORIZATION || request.headers.get("Authorization") !== env.REVENUECAT_WEBHOOK_AUTHORIZATION) {
    return jsonResponse({ error: "invalid_authorization" }, 403);
  }
  const event = ((await request.json()) as RevenueCatWebhook).event;
  if (!event?.type) return jsonResponse({ error: "invalid_event" }, 400);
  if (!ACTIVE_EVENTS.has(event.type) && !INACTIVE_EVENTS.has(event.type)) return jsonResponse({ ok: true, ignored: event.type });
  const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter((id): id is string => !!id && !id.startsWith("$RCAnonymousID:"));
  if (!ids.length) return jsonResponse({ error: "missing_customer_id" }, 400);
  const customer = await env.DB.prepare(`SELECT id FROM customers WHERE id IN (${ids.map(() => "?").join(", ")}) LIMIT 1`).bind(...ids).first<{ id: string }>();
  if (!customer) return jsonResponse({ ok: true, ignored: "unknown_customer" });
  const status = ACTIVE_EVENTS.has(event.type) ? "active" : event.type === "BILLING_ISSUE" ? "past_due" : "expired";
  await setSubscriptionSourceStatus(env, customer.id, "revenuecat", status, event.expiration_at_ms ? Math.floor(event.expiration_at_ms / 1000) : null);
  return jsonResponse({ ok: true });
}
