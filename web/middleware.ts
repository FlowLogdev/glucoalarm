import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/history", "/settings", "/log", "/reports", "/admin"];

export function middleware(request: NextRequest) {
  // logs.glucoalarm.com is the same app; its root opens the super-admin logs console.
  if (request.headers.get("host")?.startsWith("logs.") && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

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
  matcher: ["/", "/dashboard/:path*", "/history/:path*", "/settings/:path*", "/log/:path*", "/reports/:path*", "/admin/:path*"],
};
