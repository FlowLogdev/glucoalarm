import type { Env } from "../types";
import type { AlertType } from "./alerts";

export class TwilioError extends Error {}

/**
 * Sends via Twilio's WhatsApp channel (To/From both prefixed "whatsapp:").
 * The recipient must have opted in to receive messages from
 * TWILIO_WHATSAPP_FROM (join the Sandbox, or be an approved contact in
 * production). See README for the opt-in step.
 */
export async function sendWhatsApp(to: string, body: string, env: Env): Promise<void> {
  if (env.MESSAGE_MODE !== "whatsapp") {
    console.log(`[WhatsApp stub] to=${to} body=${body}`);
    return;
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${env.TWILIO_SID}:${env.TWILIO_AUTH}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
        Body: body,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new TwilioError(`Twilio WhatsApp send failed (${res.status}): ${text}`);
  }
}

export function messageFor(
  type: AlertType,
  name: string,
  value: number | null,
  trend: string | null,
  staleMinutes: number | null,
  time: string
): string {
  switch (type) {
    case "warn_low":
      return `⚠️ LOW — ${name}: ${value} mg/dL, ${trend} (${time})`;
    case "critical_low":
      return `🚨 CRITICAL LOW — ${name}: ${value} mg/dL, ${trend}. ACT NOW. (${time})`;
    case "warn_high":
      return `⚠️ HIGH — ${name}: ${value} mg/dL, ${trend} (${time})`;
    case "critical_high":
      return `🚨 CRITICAL HIGH — ${name}: ${value} mg/dL, ${trend}. ACT NOW. (${time})`;
    case "signal_lost":
      return `📵 No reading from ${name}'s Dexcom in ${staleMinutes}+ min (last: ${value} mg/dL at ${time})`;
    case "recovered":
      return `✅ ${name} back in safe range: ${value} mg/dL (${time})`;
  }
}
