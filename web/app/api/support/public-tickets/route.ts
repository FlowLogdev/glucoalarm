import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const res = await fetch(`${API_BASE_URL}/api/support/public-tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const responseBody = await res.text();
  return new NextResponse(responseBody, { status: res.status, headers: { "Content-Type": "application/json" } });
}
