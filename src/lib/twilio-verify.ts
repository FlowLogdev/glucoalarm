/**
 * Validates that a webhook request genuinely came from Twilio, per their
 * documented algorithm: HMAC-SHA1(authToken, url + sorted-concatenated
 * POST params) must match the X-Twilio-Signature header, base64-encoded.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * This matters because /api/calls/ack is a public, unauthenticated
 * endpoint (Twilio can't send our admin bearer token) that changes real
 * state (stops future low-glucose calls) -- without this check, anyone
 * who found the URL could silence real alerts by POSTing Digits=1.
 */
export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  if (computed.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}
