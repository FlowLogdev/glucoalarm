import type { Env } from "../types";

export class TwilioError extends Error {}

export async function sendSMS(to: string, body: string, env: Env): Promise<void> {
  if (env.SMS_MODE !== "twilio") {
    console.log(`[SMS stub] to=${to} body=${body}`);
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
      body: new URLSearchParams({ To: to, From: env.TWILIO_PHONE, Body: body }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new TwilioError(`Twilio send failed (${res.status}): ${text}`);
  }
}

export function messageFor(
  type: "high" | "low" | "signal_lost" | "recovered",
  name: string,
  value: number | null,
  trend: string | null,
  staleMinutes: number | null,
  time: string
): string {
  switch (type) {
    case "low":
      return `⚠️ LOW — ${name}: ${value} mg/dL, ${trend} (${time})`;
    case "high":
      return `⚠️ HIGH — ${name}: ${value} mg/dL, ${trend} (${time})`;
    case "signal_lost":
      return `📵 No reading from ${name}'s Dexcom in ${staleMinutes}+ min (last: ${value} mg/dL at ${time})`;
    case "recovered":
      return `✅ ${name} back in range: ${value} mg/dL (${time})`;
  }
}
