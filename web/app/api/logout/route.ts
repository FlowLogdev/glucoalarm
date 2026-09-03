import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";

export async function POST() {
  const jar = await cookies();
  const sessionId = jar.get("session_id")?.value;

  if (sessionId) {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionId}` },
    }).catch(() => {});
  }

  jar.delete("session_id");
  return NextResponse.json({ ok: true });
}
