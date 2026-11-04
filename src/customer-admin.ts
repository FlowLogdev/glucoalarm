import type { Admin } from "./auth";
import { clientIp, logAudit } from "./ops";
import { isBillingActive } from "./subscription-status";
import type { Env } from "./types";

interface CustomerRow {
  id: string;
  display_name: string;
  is_app_review_demo: number;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  revenuecat_subscription_status: string | null;
}

/** Narrower than is_super_admin on purpose: these actions can stop monitoring or destroy data. */
export function canManageCustomers(env: Env, admin: Admin): boolean {
  return !!env.CUSTOMER_ADMIN_EMAIL && admin.email.toLowerCase() === env.CUSTOMER_ADMIN_EMAIL.toLowerCase();
}

/** Accounts that can't be changed here, since one wrong click would be far too costly. */
export function customerProtectedReason(customer: { id: string; is_app_review_demo: number }, admin: Admin): string | null {
  if (customer.id === admin.customer_id) return "Your own account: this would stop its monitoring";
  if (customer.is_app_review_demo) return "Apple App Review demo account";
  return null;
}

async function loadManageableCustomer(env: Env, admin: Admin, id: string): Promise<CustomerRow | { error: string; status: number }> {
  if (!canManageCustomers(env, admin)) return { error: "forbidden", status: 403 };
  const customer = await env.DB
    .prepare(`SELECT id, display_name, is_app_review_demo, stripe_subscription_id, stripe_subscription_status, revenuecat_subscription_status FROM customers WHERE id = ?`)
    .bind(id)
    .first<CustomerRow>();
  if (!customer) return { error: "not_found", status: 404 };
  const reason = customerProtectedReason(customer, admin);
  if (reason) return { error: `protected: ${reason}`, status: 403 };
  return customer;
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function audit(env: Env, request: Request, admin: Admin, action: string, customerId: string, detail: string): Promise<void> {
  await logAudit(env, { action, adminId: admin.id, customerId, detail: `${detail}; by ${admin.email}`, ip: clientIp(request) });
}

/**
 * Deactivating stops polling, alerts and calls, but not billing. Activating
 * hands control back to billing if the customer is paying; otherwise it's a
 * manual grant that lasts until someone deactivates them.
 */
export async function setCustomerStatus(env: Env, admin: Admin, id: string, request: Request): Promise<Response> {
  const body = await request.json<{ status?: string }>();
  if (body.status !== "active" && body.status !== "inactive") return respond({ error: "status must be active or inactive" }, 400);
  const customer = await loadManageableCustomer(env, admin, id);
  if ("error" in customer) return respond({ error: customer.error }, customer.status);

  const paying = isBillingActive(customer.stripe_subscription_status) || isBillingActive(customer.revenuecat_subscription_status);
  const override = body.status === "active" && paying ? null : body.status;
  await env.DB
    .prepare(`UPDATE customers SET subscription_status = ?, admin_status_override = ? WHERE id = ?`)
    .bind(body.status, override, id)
    .run();
  await audit(env, request, admin, body.status === "active" ? "customer_activated" : "customer_deactivated", id, customer.display_name);
  return respond({ ok: true, status: body.status, billing_continues: body.status === "inactive" && paying });
}

/**
 * Permanently removes the customer and everything that hangs off them. There
 * are no foreign keys to cascade, so every table is listed here -- a new
 * person- or customer-scoped table must be added too. Runs as one D1 batch,
 * which is all-or-nothing. audit_log is kept on purpose: it's the record of
 * who deleted whom, and it ages out by itself.
 */
export async function deleteCustomer(env: Env, admin: Admin, id: string, request: Request): Promise<Response> {
  const body = await request.json<{ confirm_name?: string }>();
  const customer = await loadManageableCustomer(env, admin, id);
  if ("error" in customer) return respond({ error: customer.error }, customer.status);
  if (body.confirm_name !== customer.display_name) return respond({ error: "confirm_name does not match the customer's name" }, 400);

  // Deleting our records wouldn't stop their subscription, so they'd keep being charged.
  const stripePaying = !!customer.stripe_subscription_id && isBillingActive(customer.stripe_subscription_status);
  const appStorePaying = isBillingActive(customer.revenuecat_subscription_status);
  if (stripePaying || appStorePaying) {
    return respond({ error: `This customer has an active ${stripePaying ? "Stripe" : "App Store"} subscription. Cancel it first, then delete.` }, 409);
  }

  const emails = await env.DB
    .prepare(`SELECT GROUP_CONCAT(email, ', ') AS emails FROM admins WHERE customer_id = ?`)
    .bind(id)
    .first<{ emails: string | null }>();

  const people = `SELECT id FROM people WHERE customer_id = ?`;
  const admins = `SELECT id FROM admins WHERE customer_id = ?`;
  const statements = [
    // message_log has no owner column. A number also on another customer's contacts keeps its log.
    `DELETE FROM message_log WHERE to_number IN (SELECT phone_number FROM phone_subscribers WHERE person_id IN (${people}))
       AND to_number NOT IN (SELECT phone_number FROM phone_subscribers WHERE person_id NOT IN (${people}))`,
    ...["readings", "phone_subscribers", "alerts_log", "insulin_log", "insights", "glucose_reports", "a1c_records", "bot_queries", "mobile_alert_episodes", "error_log"].map(
      (table) => `DELETE FROM ${table} WHERE person_id IN (${people})`
    ),
    `DELETE FROM ops_state WHERE key IN (SELECT 'person:' || id FROM people WHERE customer_id = ?)`,
    `DELETE FROM mobile_auth_grants WHERE session_id IN (SELECT id FROM auth_sessions WHERE admin_id IN (${admins}))`,
    `DELETE FROM auth_sessions WHERE admin_id IN (${admins})`,
    `DELETE FROM mobile_push_devices WHERE admin_id IN (${admins})`,
    `DELETE FROM support_ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE customer_id = ?)`,
    `DELETE FROM support_tickets WHERE customer_id = ?`,
    `DELETE FROM admins WHERE customer_id = ?`,
    `DELETE FROM people WHERE customer_id = ?`,
    `DELETE FROM customers WHERE id = ?`,
  ];
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql).bind(...sql.split("?").slice(1).map(() => id))));

  await audit(env, request, admin, "customer_deleted", id, `${customer.display_name} (${emails?.emails ?? "no logins"})`);
  return respond({ ok: true });
}
