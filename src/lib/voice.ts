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
 *
 * A null `actionUrl` plays the message with nothing to acknowledge: pressing 1
 * on a "no data" call must not silence calls for a real low once data returns.
 */
export async function makeVoiceCall(
  to: string,
  message: string,
  actionUrl: string | null,
  env: Env,
  language: CallLanguage = "en",
): Promise<void> {
  if (env.MESSAGE_MODE !== "whatsapp") {
    console.log(`[Voice call stub] to=${to} message=${message} actionUrl=${actionUrl} language=${language}`);
    return;
  }

  const kind = actionUrl ? "low glucose call" : "signal lost call";
  const say = sayTag(actionUrl ? `${message} ${ACK_PROMPT[language]}` : message, language);
  const firstPlay = actionUrl
    ? `<Gather numDigits="1" timeout="10" action="${escapeXml(`${actionUrl}${actionUrl.includes("?") ? "&" : "?"}call_language=${language}`)}" method="POST">${say}</Gather>`
    : say;
  const twiml =
    `<Response>` +
    // The audio path can take a moment after pickup -- don't lose the opening words.
    `<Pause length="1"/>` +
    firstPlay +
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
    await recordMessage(env, { channel: "voice", to, kind, sid: null, status: "send_failed", errorMessage: text });
    throw new TwilioVoiceError(`Twilio call failed (${res.status}): ${text}`);
  }
  const call = await res.json<{ sid: string; status: string }>();
  await recordMessage(env, { channel: "voice", to, kind, sid: call.sid, status: call.status });
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

const SIGNAL_LOST_TEMPLATES: Record<CallLanguage, (name: string, value: number, time: string) => string> = {
  en: (name, value, time) =>
    `This is an alert from Glucoalarm. We have lost the Dexcom signal for ${name}, so the current glucose is unknown. The last reading was ${value} milligrams per deciliter at ${time}, and it may no longer be accurate. Please check with a finger stick.`,
  es: (name, value, time) =>
    `Esta es una alerta de Glucoalarm. Hemos perdido la señal de Dexcom de ${name}, por lo que no se conoce la glucosa actual. La última lectura fue de ${value} miligramos por decilitro a las ${time}, y puede que ya no sea correcta. Por favor verifique con una prueba en el dedo.`,
  pt: (name, value, time) =>
    `Este é um alerta do Glucoalarm. Perdemos o sinal do Dexcom de ${name}, então a glicose atual é desconhecida. A última leitura foi de ${value} miligramas por decilitro às ${time}, e pode não estar mais correta. Por favor, confirme com um teste no dedo.`,
};

export function signalLostCallMessageFor(name: string, value: number, time: string, language: CallLanguage = "en"): string {
  return SIGNAL_LOST_TEMPLATES[normalizeCallLanguage(language)](name, value, time);
}

export function callMessageFor(name: string, value: number, time: string, language: CallLanguage = "en"): string {
  return ALERT_TEMPLATES[normalizeCallLanguage(language)](name, value, time);
}
