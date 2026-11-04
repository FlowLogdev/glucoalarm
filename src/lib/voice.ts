import type { Env } from "../types";
import { normalizeCallLanguage, sayTag, type CallLanguage } from "./voice-i18n";
import { recordMessage, statusCallbackUrl } from "./message-log";

export class TwilioVoiceError extends Error {}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const CALL_RING_TIMEOUT_SECONDS = 20;

/**
 * Places a real phone call reading the alert aloud via Twilio's Voice API,
 * using inline TwiML (no separate webhook endpoint needed for the call
 * itself). Offers a <Gather> so the recipient can press 1 to acknowledge --
 * Twilio POSTs the keypress to `actionUrl` (see /api/calls/ack). If nobody
 * presses anything, falls through to repeating the message once more and
 * hanging up; the call itself doesn't retry -- pollPerson's 5-min repeat
 * cadence handles that on the next poll.
 */
export async function makeVoiceCall(
  to: string,
  message: string,
  actionUrl: string,
  env: Env,
  language: CallLanguage = "en",
): Promise<void> {
  if (env.MESSAGE_MODE !== "whatsapp") {
    console.log(`[Voice call stub] to=${to} message=${message} actionUrl=${actionUrl} language=${language}`);
    return;
  }

  const fullMessage = `${message} ${ACK_PROMPT[language]}`;
  const say = sayTag(fullMessage, language);
  const actionUrlWithLanguage = `${actionUrl}${actionUrl.includes("?") ? "&" : "?"}call_language=${language}`;
  const twiml =
    `<Response>` +
    // The audio path can take a moment after pickup -- don't lose the opening words.
    `<Pause length="1"/>` +
    `<Gather numDigits="1" timeout="10" action="${escapeXml(actionUrlWithLanguage)}" method="POST">${say}</Gather>` +
    say +
    `</Response>`;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.TWILIO_SID}:${env.TWILIO_AUTH}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: env.TWILIO_VOICE_FROM,
      Twiml: twiml,
      Timeout: String(CALL_RING_TIMEOUT_SECONDS),
      StatusCallback: statusCallbackUrl(env),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    await recordMessage(env, { channel: "voice", to, kind: "low glucose call", sid: null, status: "send_failed", errorMessage: text });
    throw new TwilioVoiceError(`Twilio call failed (${res.status}): ${text}`);
  }
  const call = await res.json<{ sid: string; status: string }>();
  await recordMessage(env, { channel: "voice", to, kind: "low glucose call", sid: call.sid, status: call.status });
}

const ACK_PROMPT: Record<CallLanguage, string> = {
  en: "Please acknowledge by pressing 1. This stops repeat calls for this level.",
  es: "Por favor confirme presionando 1. Esto detiene las llamadas repetidas para este nivel.",
  pt: "Por favor confirme pressionando 1. Isso interrompe as ligações repetidas para este nível.",
};

const ALERT_TEMPLATES: Record<CallLanguage, (name: string, value: number, time: string) => string> = {
  en: (name, value, time) =>
    `This is an alert from Glucoalarm. ${name}'s glucose is low at ${value} milligrams per deciliter, recorded at ${time}.`,
  es: (name, value, time) =>
    `Esta es una alerta de Glucoalarm. El nivel de glucosa de ${name} está bajo, ${value} miligramos por decilitro, registrado a las ${time}.`,
  pt: (name, value, time) =>
    `Este é um alerta do Glucoalarm. O nível de glicose de ${name} está baixo, ${value} miligramas por decilitro, registrado às ${time}.`,
};

export function callMessageFor(name: string, value: number, time: string, language: CallLanguage = "en"): string {
  return ALERT_TEMPLATES[normalizeCallLanguage(language)](name, value, time);
}
