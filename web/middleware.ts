import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/history", "/settings", "/log", "/reports"];

export function middleware(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const sessionId = request.cookies.get("session_id")?.value;
  if (!sessionId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/history/:path*", "/settings/:path*", "/log/:path*", "/reports/:path*"],
};
