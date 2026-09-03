import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";

export async function POST(request: NextRequest) {
  const body = await request.text();

  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text();
    return new NextResponse(errBody, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { sessionId, expiresAt } = (await res.json()) as { sessionId: string; expiresAt: number };
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

  (await cookies()).set("session_id", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return NextResponse.json({ ok: true });
}
