import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * Landing point after the Worker's /api/auth/google/callback creates a
 * session for a returning Google-authenticated admin (login case, not
 * signup -- signup goes to Stripe Checkout instead, see src/google-auth.ts).
 * The Worker can't set an httpOnly cookie on glucoalarm.com's own domain,
 * so it hands the session id here as a one-time query param and this route
 * sets the cookie itself, same as /api/login does after a password login.
 */
export async function GET(request: NextRequest) {
  const sid = request.nextUrl.searchParams.get("sid");
  const exp = request.nextUrl.searchParams.get("exp");
  if (!sid || !exp) {
    return NextResponse.redirect(new URL("/login?error=google_auth_failed", request.url));
  }

  const maxAge = Math.max(0, Number(exp) - Math.floor(Date.now() / 1000));
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  (await cookies()).set("session_id", sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return response;
}
