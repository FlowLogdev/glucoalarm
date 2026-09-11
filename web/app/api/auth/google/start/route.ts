import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";

// Kept on this app's own domain (rather than linking the browser straight
// at the Worker) so it matches every other auth entry point's pattern --
// the browser only ever navigates within glucoalarm.com's own routes.
export async function GET(request: NextRequest) {
  const intent = request.nextUrl.searchParams.get("intent") === "login" ? "login" : "signup";
  return NextResponse.redirect(`${API_BASE_URL}/api/auth/google/start?intent=${intent}`);
}
