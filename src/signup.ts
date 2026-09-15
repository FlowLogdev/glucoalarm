import { createCheckoutSession, retrieveCheckoutSession } from "./lib/stripe";
import { hashPassword } from "./lib/password";
import { verifyPendingGoogleSignup } from "./lib/google-oauth";
import { createSession } from "./auth";
import { encrypt } from "./lib/crypto";
import { DexcomShareClient, DexcomApiError, DexcomSessionError } from "./lib/dexcom-client-share";
import type { Env } from "./types";
import type { Admin } from "./auth";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function postSignupCheckout(env: Env): Promise<Response> {
  try {
    const session = await createCheckoutSession(
      env,
      `${env.PUBLIC_WEB_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      `${env.PUBLIC_WEB_URL}/signup`
    );
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("postSignupCheckout failed:", err);
    return jsonResponse({ error: "checkout_session_failed" }, 502);
  }
}

export async function postSignupComplete(env: Env, request: Request, now: number): Promise<Response> {
  const body = await request.json<{
    session_id?: string;
    display_name?: string;
    email?: string;
    password?: string;
  }>();
  if (!body.session_id || !body.display_name || !body.email || !body.password) {
    return jsonResponse({ error: "session_id, display_name, email, and password are required" }, 400);
  }
  if (body.password.length < 8) {
    return jsonResponse({ error: "password must be at least 8 characters" }, 400);
  }

  // With a 7-day trial, Stripe collects $0 at checkout and reports
  // payment_status "no_payment_required" rather than "paid" -- both mean
  // the subscription was created successfully.
  const stripeSession = await retrieveCheckoutSession(env, body.session_id);
  if (!stripeSession || !["paid", "no_payment_required"].includes(stripeSession.payment_status)) {
    return jsonResponse({ error: "payment_not_confirmed" }, 402);
  }

  const email = body.email.toLowerCase().trim();
  const existingAdmin = await env.DB.prepare(`SELECT id FROM admins WHERE email = ?`).bind(email).first();
  if (existingAdmin) {
    return jsonResponse({ error: "email_already_registered" }, 409);
  }

  const customerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);

  try {
    await env.DB
      .prepare(
        `INSERT INTO customers (id, display_name, created_at, stripe_customer_id, stripe_subscription_id, subscription_status, stripe_subscription_status, stripe_checkout_session_id)
         VALUES (?, ?, ?, ?, ?, 'active', 'active', ?)`
      )
      .bind(customerId, body.display_name, now, stripeSession.customer, stripeSession.subscription, stripeSession.id)
      .run();
  } catch (err) {
    // UNIQUE constraint on stripe_checkout_session_id -- this session already completed signup once.
    console.error("postSignupComplete: customer insert failed (likely already used):", err);
    return jsonResponse({ error: "session_already_used" }, 409);
  }

  await env.DB
    .prepare(`INSERT INTO admins (id, email, password_hash, is_super_admin, customer_id, created_at) VALUES (?, ?, ?, 0, ?, ?)`)
    .bind(adminId, email, passwordHash, customerId, now)
    .run();

  const { sessionId, expiresAt } = await createSession(env, adminId, now);
  return jsonResponse({ sessionId, expiresAt }, 201);
}

function randomUnusablePassword(): string {
  // Google-authenticated admins never log in with a password, but
  // password_hash is NOT NULL -- this fills it with something no plaintext
  // login attempt could ever match, same idea as doctors.ts's invite flow.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

/**
 * Sibling to postSignupComplete for Google-originated signups: the email
 * was already verified by Google before Checkout even started (see
 * src/google-auth.ts), so this only needs the display name -- no
 * email/password fields, and no way to un-verify what Google already
 * confirmed. Payment is still verified the same way as the password flow
 * before any row is created.
 */
export async function postSignupCompleteGoogle(env: Env, request: Request, now: number): Promise<Response> {
  const body = await request.json<{ session_id?: string; google_token?: string; display_name?: string }>();
  if (!body.session_id || !body.google_token || !body.display_name) {
    return jsonResponse({ error: "session_id, google_token, and display_name are required" }, 400);
  }

  const pending = await verifyPendingGoogleSignup(env, body.google_token, now);
  if (!pending) {
    return jsonResponse({ error: "google_token_expired" }, 400);
  }

  const stripeSession = await retrieveCheckoutSession(env, body.session_id);
  if (!stripeSession || !["paid", "no_payment_required"].includes(stripeSession.payment_status)) {
    return jsonResponse({ error: "payment_not_confirmed" }, 402);
  }

  const email = pending.email.toLowerCase().trim();
  const existingAdmin = await env.DB.prepare(`SELECT id FROM admins WHERE email = ?`).bind(email).first();
  if (existingAdmin) {
    return jsonResponse({ error: "email_already_registered" }, 409);
  }

  const customerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const passwordHash = await hashPassword(randomUnusablePassword());

  try {
    await env.DB
      .prepare(
        `INSERT INTO customers (id, display_name, created_at, stripe_customer_id, stripe_subscription_id, subscription_status, stripe_subscription_status, stripe_checkout_session_id)
         VALUES (?, ?, ?, ?, ?, 'active', 'active', ?)`
      )
      .bind(customerId, body.display_name, now, stripeSession.customer, stripeSession.subscription, stripeSession.id)
      .run();
  } catch (err) {
    console.error("postSignupCompleteGoogle: customer insert failed (likely already used):", err);
    return jsonResponse({ error: "session_already_used" }, 409);
  }

  await env.DB
    .prepare(
      `INSERT INTO admins (id, email, password_hash, is_super_admin, customer_id, created_at, auth_provider, google_sub)
       VALUES (?, ?, ?, 0, ?, ?, 'google', ?)`
    )
    .bind(adminId, email, passwordHash, customerId, now, pending.sub)
    .run();

  const { sessionId, expiresAt } = await createSession(env, adminId, now);
  return jsonResponse({ sessionId, expiresAt }, 201);
}

const DEFAULT_THRESHOLDS = { safe_low: 96, safe_high: 200, critical_low: 70, critical_high: 250 };

/**
 * Customer-submitted Dexcom connection during onboarding. Validates the
 * credentials with one real Dexcom auth handshake before storing anything,
 * so the customer gets immediate feedback instead of a silent failure at
 * the next cron poll. Enforces one monitored person per customer account
 * (this MVP's plan -- multi-person accounts are a future addition).
 */
export async function postPeople(env: Env, request: Request, admin: Admin, now: number): Promise<Response> {
  if (!admin.customer_id) {
    return jsonResponse({ error: "no_customer_account" }, 400);
  }

  const body = await request.json<{ name?: string; dexcom_username?: string; dexcom_password?: string }>();
  if (!body.name || !body.dexcom_username || !body.dexcom_password) {
    return jsonResponse({ error: "name, dexcom_username, and dexcom_password are required" }, 400);
  }

  const existing = await env.DB
    .prepare(`SELECT id FROM people WHERE customer_id = ?`)
    .bind(admin.customer_id)
    .first();
  if (existing) {
    return jsonResponse({ error: "person_already_exists" }, 400);
  }

  const client = new DexcomShareClient(env.DEXCOM_BASE_URL, env.DEXCOM_APPLICATION_ID);
  try {
    await client.authenticate(body.dexcom_username, body.dexcom_password);
  } catch (err) {
    if (err instanceof DexcomSessionError || err instanceof DexcomApiError) {
      return jsonResponse({ error: "dexcom_authentication_failed" }, 400);
    }
    console.error("postPeople: Dexcom validation failed unexpectedly:", err);
    return jsonResponse({ error: "dexcom_validation_error" }, 502);
  }

  const encryptedPassword = await encrypt(body.dexcom_password, env.DEXCOM_ENC_KEY);
  const personId = crypto.randomUUID();

  await env.DB
    .prepare(
      `INSERT INTO people
        (id, name, dexcom_username, dexcom_password, customer_id, safe_low, safe_high, critical_low, critical_high, stale_minutes, ticker_interval_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 20, 20)`
    )
    .bind(
      personId,
      body.name,
      body.dexcom_username,
      encryptedPassword,
      admin.customer_id,
      DEFAULT_THRESHOLDS.safe_low,
      DEFAULT_THRESHOLDS.safe_high,
      DEFAULT_THRESHOLDS.critical_low,
      DEFAULT_THRESHOLDS.critical_high
    )
    .run();

  return jsonResponse({ id: personId }, 201);
}
