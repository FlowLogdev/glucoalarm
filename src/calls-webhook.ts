import { escapeXml } from "./lib/voice";
import { verifyTwilioSignature } from "./lib/twilio-verify";
import type { Env } from "./types";

function twiml(sayText: string, status = 200): Response {
  const body = `<Response><Say voice="Polly.Joanna">${escapeXml(sayText)}</Say></Response>`;
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

/**
 * Twilio POSTs here after a low-glucose call's <Gather> completes (digit
 * pressed, or timed out with none). Public/unauthenticated by necessity --
 * Twilio can't send our admin bearer token -- so the request is verified
 * via Twilio's own signature scheme instead. See src/lib/twilio-verify.ts
 * for why that check isn't optional here: this endpoint can silence real
 * low-glucose calls, so it can't be left open to anyone who finds the URL.
 */
export async function handleCallAck(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const personId = url.searchParams.get("person_id");
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const signature = request.headers.get("X-Twilio-Signature");

  const valid = await verifyTwilioSignature(env.TWILIO_AUTH, request.url, params, signature);
  if (!valid) {
    console.error("handleCallAck: invalid Twilio signature");
    return twiml("This request could not be verified. Goodbye.", 403);
  }
  if (!personId) {
    return twiml("Missing person. Goodbye.", 400);
  }

  if (params["Digits"] === "1") {
    const result = await env.DB
      .prepare(`UPDATE people SET low_call_acknowledged = 1 WHERE id = ?`)
      .bind(personId)
      .run();
    if (result.meta.changes === 0) return twiml("Unknown person. Goodbye.", 404);
    return twiml("Acknowledged. You will not receive more calls for this low. Goodbye.");
  }

  return twiml("No acknowledgment received. You may receive another call shortly. Goodbye.");
}
