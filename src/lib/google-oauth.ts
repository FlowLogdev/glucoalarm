import type { Env } from "../types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function googleRedirectUri(env: Env): string {
  return `${env.PUBLIC_WORKER_URL}/api/auth/google/callback`;
}

/**
 * `state` is a short HMAC-signed, timestamped token (no D1 storage needed)
 * carrying just enough to prevent CSRF on the callback and to know where
 * to send the browser back to (signup vs. login entry point). Same
 * HMAC-over-JSON approach as the other signed-token helpers in this file.
 */
async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signToken(payload: object, secret: string): Promise<string> {
  const json = JSON.stringify(payload);
  const b64 = btoa(json);
  const sig = await hmacSign(b64, secret);
  return `${b64}.${sig}`;
}

async function verifyToken<T>(token: string, secret: string): Promise<T | null> {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = await hmacSign(b64, secret);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return JSON.parse(atob(b64)) as T;
  } catch {
    return null;
  }
}

export interface OAuthState {
  intent: "signup" | "login";
  issuedAt: number;
}

const STATE_TTL_SECONDS = 10 * 60;
// Longer than the OAuth state's TTL -- this token has to survive the whole
// Stripe Checkout round-trip (card entry can reasonably take a while),
// not just the quick Google redirect dance.
const PENDING_SIGNUP_TTL_SECONDS = 60 * 60;

export async function createOAuthState(env: Env, intent: "signup" | "login", now: number): Promise<string> {
  return signToken({ intent, issuedAt: now } satisfies OAuthState, env.GOOGLE_OAUTH_STATE_SECRET);
}

export async function verifyOAuthState(env: Env, state: string, now: number): Promise<OAuthState | null> {
  const parsed = await verifyToken<OAuthState>(state, env.GOOGLE_OAUTH_STATE_SECRET);
  if (!parsed || now - parsed.issuedAt > STATE_TTL_SECONDS) return null;
  return parsed;
}

export function buildGoogleAuthUrl(env: Env, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(env),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

/** Exchanges the authorization code for tokens, then fetches the profile from Google's userinfo endpoint (simpler and just as trustworthy over HTTPS as verifying the id_token JWT signature ourselves). */
export async function exchangeGoogleCode(env: Env, code: string): Promise<GoogleUserInfo> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri(env),
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
  const { access_token } = await tokenRes.json<{ access_token: string }>();

  const userRes = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!userRes.ok) throw new Error(`Google userinfo fetch failed (${userRes.status}): ${await userRes.text()}`);
  const info = await userRes.json<GoogleUserInfo>();
  if (!info.email || !info.email_verified) throw new Error("Google account has no verified email");
  return info;
}

/**
 * Carries the verified Google identity through the Stripe Checkout
 * round-trip (signup flow only) -- signed so postSignupCompleteGoogle can
 * trust it without a DB round-trip, short-lived like the OAuth state.
 */
export interface PendingGoogleSignup {
  sub: string;
  email: string;
  name?: string;
  issuedAt: number;
}

export async function signPendingGoogleSignup(env: Env, info: GoogleUserInfo, now: number): Promise<string> {
  return signToken({ sub: info.sub, email: info.email, name: info.name, issuedAt: now } satisfies PendingGoogleSignup, env.GOOGLE_OAUTH_STATE_SECRET);
}

export async function verifyPendingGoogleSignup(env: Env, token: string, now: number): Promise<PendingGoogleSignup | null> {
  const parsed = await verifyToken<PendingGoogleSignup>(token, env.GOOGLE_OAUTH_STATE_SECRET);
  if (!parsed || now - parsed.issuedAt > PENDING_SIGNUP_TTL_SECONDS) return null;
  return parsed;
}
