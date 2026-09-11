import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const sessionId = (await cookies()).get("session_id")?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workerUrl = `${API_BASE_URL}/api/${path.join("/")}${request.nextUrl.search}`;
  const init: RequestInit = {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionId}`,
    },
  };
  if (request.method !== "GET" && request.method !== "DELETE") {
    init.body = await request.text();
  }

  const res = await fetch(workerUrl, init);
  const body = await res.text();
  const headers: Record<string, string> = { "Content-Type": res.headers.get("Content-Type") ?? "application/json" };
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) headers["Content-Disposition"] = disposition;
  return new NextResponse(body, { status: res.status, headers });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(request, (await params).path);
}
