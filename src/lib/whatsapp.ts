import type { Env } from "../types";
import type { AlertType } from "./alerts";

export class TwilioError extends Error {}

/**
 * Sends via Twilio's WhatsApp channel using the approved `glucose_alert_v2`
 * Content Template (business-initiated), not free-form Body text. Free-form
 * messages only work within 24h of the recipient's last inbound message
 * (Twilio error 63016 otherwise) -- a real production gap for a safety
 * alert that might be needed exactly when nobody's messaged in a day.
 * Approved templates are exempt from that window, so this always works.
 */
export async function sendWhatsApp(to: string, variables: Record<string, string>, env: Env): Promise<void> {
  if (env.MESSAGE_MODE !== "whatsapp") {
    console.log(`[WhatsApp stub] to=${to} variables=${JSON.stringify(variables)}`);
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
        ContentSid: env.WHATSAPP_TEMPLATE_SID,
        ContentVariables: JSON.stringify(variables),
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new TwilioError(`Twilio WhatsApp send failed (${res.status}): ${text}`);
  }

  const data = await res.json<{ sid: string; status: string }>();
  console.log(`sendWhatsApp accepted: to=${to} sid=${data.sid} status=${data.status}`);
}

function labelFor(type: AlertType, staleMinutes: number | null): string {
  switch (type) {
    case "warn_low":
      return "⚠️ LOW";
    case "critical_low":
      return "🚨 CRITICAL LOW - ACT NOW";
    case "warn_high":
      return "⚠️ ATTENTION";
    case "critical_high":
      return "🚨 HIGH - ACT NOW";
    case "signal_lost":
      return `📵 NO DEXCOM SIGNAL (${staleMinutes}+ min)`;
    case "recovered":
      return "✅ BACK IN SAFE RANGE";
    case "signal_restored":
      return "📶 SIGNAL RESTORED";
  }
}

/**
 * Builds the glucose_alert_v2 template's 5 variables (HXf9e3a1a7c89c99e5f-
 * 536a4018ed47ba8, WHATSAPP_TEMPLATE_SID): "Glucoalarm notification: {{1}}
 * for {{2}}. Current glucose reading is {{3}} mg/dL and trending {{4}}.
 * Recorded at {{5}}. Please check in as needed."
 */
export function alertVariables(
  type: AlertType,
  name: string,
  value: number | null,
  trend: string | null,
  staleMinutes: number | null,
  time: string
): Record<string, string> {
  return {
    "1": labelFor(type, staleMinutes),
    "2": name,
    "3": value !== null ? String(value) : "n/a",
    "4": trend ?? "n/a",
    "5": time,
  };
}

/**
 * Periodic update sent every 20 min while in the safe range, so recipients
 * see a live number like Dexcom's own app rather than silence until the
 * next tier change. Out-of-range tiers don't need a separate ticker -- they
 * already resend via alertVariables() every poll through the existing
 * cooldown.
 */
export function tickerVariables(name: string, value: number, trend: string | null, time: string): Record<string, string> {
  return {
    "1": "📊 In-range update",
    "2": name,
    "3": String(value),
    "4": trend ?? "n/a",
    "5": time,
  };
}
