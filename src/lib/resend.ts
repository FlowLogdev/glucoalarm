import type { Env } from "../types";

export class ResendError extends Error {}

const SUPPORT_FROM = "Glucoalarm Support <support@flowlog.dev>";

export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: SUPPORT_FROM, to: [to], subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ResendError(`Resend send failed (${res.status}): ${text}`);
  }
}
