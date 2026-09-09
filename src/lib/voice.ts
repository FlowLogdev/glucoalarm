import type { Env } from "../types";

export class TwilioVoiceError extends Error {}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Places a real phone call reading the alert aloud via Twilio's Voice API,
 * using inline TwiML (no separate webhook endpoint needed). Repeats the
 * message twice since a phone call is easy to half-hear.
 */
export async function makeVoiceCall(to: string, message: string, env: Env): Promise<void> {
  if (env.MESSAGE_MODE !== "whatsapp") {
    console.log(`[Voice call stub] to=${to} message=${message}`);
    return;
  }

  const say = `<Say voice="Polly.Joanna">${escapeXml(message)}</Say>`;
  const twiml = `<Response>${say}<Pause length="1"/>${say}</Response>`;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.TWILIO_SID}:${env.TWILIO_AUTH}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: env.TWILIO_VOICE_FROM, Twiml: twiml }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new TwilioVoiceError(`Twilio call failed (${res.status}): ${text}`);
  }
}

export function callMessageFor(name: string, value: number, time: string): string {
  return `This is an alert from Glucoalarm. ${name}'s glucose is low at ${value} milligrams per deciliter, recorded at ${time}. Please check on ${name} now.`;
}
