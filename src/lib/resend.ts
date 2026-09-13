import type { Env } from "../types";

export class ResendError extends Error {}

const SUPPORT_FROM = "Glucoalarm Support <support@flowlog.dev>";

export interface EmailAttachment {
  filename: string;
  content: string; // plain text; base64-encoded here before the Resend call
}

export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[]
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SUPPORT_FROM,
      to: [to],
      subject,
      html,
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: btoa(a.content) })) }
        : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ResendError(`Resend send failed (${res.status}): ${text}`);
  }
}
