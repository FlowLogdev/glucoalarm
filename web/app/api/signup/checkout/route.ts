import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";

export async function POST() {
  const res = await fetch(`${API_BASE_URL}/api/signup/checkout`, { method: "POST" });
  const body = await res.text();
  return new NextResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
