import type { Env } from "../types";

/**
 * Session 1 stub — logs instead of sending. Session 3 replaces the body with
 * a real Twilio API call (TWILIO_SID / TWILIO_AUTH / TWILIO_PHONE secrets).
 */
export async function sendSMS(to: string, body: string, _env: Env): Promise<void> {
  console.log(`[SMS stub] to=${to} body=${body}`);
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
