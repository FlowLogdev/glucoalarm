import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Cookie-presence check only, for client-side UI branching (public support
// form vs authenticated ticket view). Not a security boundary -- the Worker
// still verifies the actual bearer token on every real data request.
export async function GET() {
  const sessionId = (await cookies()).get("session_id")?.value;
  return NextResponse.json({ loggedIn: !!sessionId });
}
