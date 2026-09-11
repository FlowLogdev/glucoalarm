import {
  buildGoogleAuthUrl,
  createOAuthState,
  exchangeGoogleCode,
  signPendingGoogleSignup,
  verifyOAuthState,
} from "./lib/google-oauth";
import { createCheckoutSession } from "./lib/stripe";
import { createSession } from "./auth";
import type { Env } from "./types";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/** GET /api/auth/google/start?intent=signup|login -- kicks off the redirect to Google. */
export async function handleGoogleAuthStart(request: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent") === "login" ? "login" : "signup";
  const state = await createOAuthState(env, intent, now);
  return redirect(buildGoogleAuthUrl(env, state));
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
    return redirect(`${env.PUBLIC_WEB_URL}/login?error=google_auth_failed`);
  }

  const email = info.email.toLowerCase().trim();
  const existing = await env.DB
    .prepare(`SELECT id, auth_provider FROM admins WHERE email = ?`)
    .bind(email)
    .first<{ id: string; auth_provider: string }>();

  if (existing) {
    if (existing.auth_provider !== "google") {
      return redirect(`${env.PUBLIC_WEB_URL}/login?error=google_email_registered`);
    }
    const { sessionId, expiresAt } = await createSession(env, existing.id, now);
    return redirect(`${env.PUBLIC_WEB_URL}/api/auth/google/finish?sid=${encodeURIComponent(sessionId)}&exp=${expiresAt}`);
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
