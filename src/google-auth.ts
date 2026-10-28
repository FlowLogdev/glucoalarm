import {
  buildGoogleAuthUrl,
  createOAuthState,
  exchangeGoogleCode,
  signPendingGoogleSignup,
  verifyOAuthState,
} from "./lib/google-oauth";
import { createCheckoutSession } from "./lib/stripe";
import { createSession } from "./auth";
import { hashPassword } from "./lib/password";
import type { Env } from "./types";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/** GET /api/auth/google/start?intent=signup|login -- kicks off the redirect to Google. */
export async function handleGoogleAuthStart(request: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent") === "login" ? "login" : "signup";
  const state = await createOAuthState(env, intent, now, url.searchParams.get("native") === "1");
  return redirect(buildGoogleAuthUrl(env, state));
}

async function createMobileAuthCode(env: Env, sessionId: string, now: number): Promise<string> {
  const code = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO mobile_auth_grants (code, session_id, expires_at) VALUES (?, ?, ?)`).bind(code, sessionId, now + 5 * 60).run();
  return code;
}

async function nativeRedirect(env: Env, sessionId: string, now: number): Promise<Response> {
  const code = await createMobileAuthCode(env, sessionId, now);
  return redirect(`glucoalarm://auth?code=${encodeURIComponent(code)}`);
}

function nativeError(error: string): Response {
  return redirect(`glucoalarm://auth?error=${encodeURIComponent(error)}`);
}

function randomUnusablePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

async function provisionNativeGoogleAccount(env: Env, email: string, name: string | undefined, googleSub: string, now: number): Promise<{ sessionId: string }> {
  const customerId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO customers (id, display_name, created_at, subscription_status) VALUES (?, ?, ?, 'inactive')`).bind(customerId, name?.trim() || "GlucoAlarm member", now).run();
  try {
    await env.DB.prepare(`INSERT INTO admins (id, email, password_hash, is_super_admin, customer_id, created_at, auth_provider, google_sub) VALUES (?, ?, ?, 0, ?, ?, 'google', ?)`).bind(adminId, email, await hashPassword(randomUnusablePassword()), customerId, now, googleSub).run();
  } catch (error) {
    await env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(customerId).run();
    throw error;
  }
  return createSession(env, adminId, now);
}

export async function exchangeMobileAuthCode(env: Env, request: Request, now: number): Promise<Response> {
  const body = await request.json<{ code?: string }>();
  if (!body.code) return new Response(JSON.stringify({ error: "code is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const grant = await env.DB.prepare(`SELECT session_id, expires_at FROM mobile_auth_grants WHERE code = ?`).bind(body.code).first<{ session_id: string; expires_at: number }>();
  if (!grant || grant.expires_at < now) return new Response(JSON.stringify({ error: "auth_code_expired" }), { status: 401, headers: { "Content-Type": "application/json" } });
  await env.DB.prepare(`DELETE FROM mobile_auth_grants WHERE code = ?`).bind(body.code).run();
  return new Response(JSON.stringify({ sessionId: grant.session_id }), { headers: { "Content-Type": "application/json" } });
}

/**
 * GET /api/auth/google/callback -- Google lands here with ?code&state.
 * Public by necessity (this is the fixed redirect_uri registered with
 * Google), protected by the signed state token instead of our bearer
 * token, same reasoning as the Twilio/Stripe webhooks.
 *
 * - Existing account, auth_provider='google' -> this is a login: create a
 *   session and hand it to the Next.js app via a one-time redirect so it
 *   can set the httpOnly cookie itself (the Worker's own domain can't set
 *   a cookie glucoalarm.com will send back).
 * - Existing account, auth_provider='password' -> don't silently link
 *   identities; send them to log in with their password instead.
 * - No existing account -> signup: go straight to Stripe Checkout with
 *   the verified email prefilled, carrying a signed pending-identity
 *   token through to onboarding so the account is only ever created
 *   after payment succeeds, exactly like the existing email/password flow.
 */
export async function handleGoogleAuthCallback(request: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return redirect(`${env.PUBLIC_WEB_URL}/login?error=google_auth_failed`);

  const parsedState = await verifyOAuthState(env, state, now);
  if (!parsedState) return redirect(`${env.PUBLIC_WEB_URL}/login?error=google_auth_expired`);

  let info;
  try {
    info = await exchangeGoogleCode(env, code);
  } catch (err) {
    console.error("handleGoogleAuthCallback: token exchange failed:", err);
    return parsedState.native ? nativeError("google_auth_failed") : redirect(`${env.PUBLIC_WEB_URL}/login?error=google_auth_failed`);
  }

  const email = info.email.toLowerCase().trim();
  const existing = await env.DB
    .prepare(`SELECT id, auth_provider FROM admins WHERE email = ?`)
    .bind(email)
    .first<{ id: string; auth_provider: string }>();

  if (existing) {
    if (existing.auth_provider !== "google") {
      return parsedState.native ? nativeError("google_email_registered") : redirect(`${env.PUBLIC_WEB_URL}/login?error=google_email_registered`);
    }
    const { sessionId, expiresAt } = await createSession(env, existing.id, now);
    if (parsedState.native) return nativeRedirect(env, sessionId, now);
    return redirect(`${env.PUBLIC_WEB_URL}/api/auth/google/finish?sid=${encodeURIComponent(sessionId)}&exp=${expiresAt}`);
  }

  if (parsedState.native) {
    try {
      const { sessionId } = await provisionNativeGoogleAccount(env, email, info.name, info.sub, now);
      return nativeRedirect(env, sessionId, now);
    } catch (err) {
      console.error("native Google account provisioning failed:", err);
      return nativeError("account_creation_failed");
    }
  }

  // New account -- verify identity now, but the account itself is only
  // created after payment (src/signup.ts's postSignupCompleteGoogle).
  try {
    const googleToken = await signPendingGoogleSignup(env, info, now);
    const checkout = await createCheckoutSession(
      env,
      `${env.PUBLIC_WEB_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}&google_token=${encodeURIComponent(googleToken)}`,
      `${env.PUBLIC_WEB_URL}/signup`,
      email
    );
    return redirect(checkout.url);
  } catch (err) {
    console.error("handleGoogleAuthCallback: checkout session creation failed:", err);
    return redirect(`${env.PUBLIC_WEB_URL}/signup?error=checkout_failed`);
  }
}
