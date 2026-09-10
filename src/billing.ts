import { createPortalSession } from "./lib/stripe";
import type { Env } from "./types";
import type { Admin } from "./auth";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function getBilling(env: Env, admin: Admin): Promise<Response> {
  if (!admin.customer_id) return jsonResponse({ error: "no_customer_account" }, 400);
  const customer = await env.DB
    .prepare(`SELECT display_name, subscription_status, stripe_customer_id FROM customers WHERE id = ?`)
    .bind(admin.customer_id)
    .first<{ display_name: string; subscription_status: string; stripe_customer_id: string | null }>();
  if (!customer) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse({
    display_name: customer.display_name,
    subscription_status: customer.subscription_status,
    has_billing_account: !!customer.stripe_customer_id,
  });
}

export async function postBillingPortal(env: Env, admin: Admin, request: Request): Promise<Response> {
  if (!admin.customer_id) return jsonResponse({ error: "no_customer_account" }, 400);
  const customer = await env.DB
    .prepare(`SELECT stripe_customer_id FROM customers WHERE id = ?`)
    .bind(admin.customer_id)
    .first<{ stripe_customer_id: string | null }>();
  if (!customer?.stripe_customer_id) {
    return jsonResponse({ error: "no_billing_account" }, 400);
  }

  const body = await request.json<{ return_url?: string }>().catch(() => ({}) as { return_url?: string });
  try {
    const session = await createPortalSession(env, customer.stripe_customer_id, body.return_url ?? `${env.PUBLIC_WEB_URL}/billing`);
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("postBillingPortal failed:", err);
    return jsonResponse({ error: "portal_session_failed" }, 502);
  }
}
