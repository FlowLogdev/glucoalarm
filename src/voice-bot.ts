import { verifyTwilioSignature } from "./lib/twilio-verify";
import { escapeXml } from "./lib/voice";
import { sayTag, normalizeCallLanguage, type CallLanguage } from "./lib/voice-i18n";
import { computeGlucoseStats } from "./report-stats";
import { detectGlucoseEvents } from "./report-events";
import { formatLocalTime } from "./lib/time-format";
import type { Env } from "./types";
import type { ThresholdBand } from "./lib/alerts";

interface VoicePerson extends ThresholdBand {
  id: string;
  name: string;
  timezone: string | null;
  verified_at: number | null;
  call_language: string | null;
}

function twiml(inner: string): Response {
  return new Response(`<Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
}

const IVR_STRINGS: Record<
  CallLanguage,
  {
    notRecognized: string;
    menu: (name: string) => string;
    noInput: string;
    noReadings: (name: string) => string;
    summary: (name: string, mean: number | null, gmiText: string, timeInRangePct: number | null) => string;
    gmiNotAvailable: string;
    percent: string;
    noEvents: (name: string) => string;
    events: (name: string, parts: string) => string;
    eventLabel: (direction: "low" | "high", value: number, time: string) => string;
    invalidOption: string;
  }
> = {
  en: {
    notRecognized: "This number isn't recognized by Glucoalarm. Goodbye.",
    menu: (name) => `Hi, this is Glucoalarm. For ${name}'s summary today, press 1. For recent lows and highs, press 2.`,
    noInput: "No input received. Goodbye.",
    noReadings: (name) => `No Dexcom readings found for ${name} in the last 24 hours. Goodbye.`,
    summary: (name, mean, gmiText, timeInRangePct) =>
      `${name}'s average glucose today is ${mean} milligrams per deciliter. Estimated A1C is ${gmiText}. Time in range is ${timeInRangePct} percent. Goodbye.`,
    gmiNotAvailable: "not available -- not enough data yet",
    percent: "percent",
    noEvents: (name) => `No lows or highs recorded for ${name} in the last 24 hours. Goodbye.`,
    events: (name, parts) => `${name}'s recent events: ${parts}. Goodbye.`,
    eventLabel: (direction, value, time) => `${direction === "low" ? "Low" : "High"} of ${value} at ${time}`,
    invalidOption: "Sorry, that wasn't a valid option. Goodbye.",
  },
  es: {
    notRecognized: "Este número no está reconocido por Glucoalarm. Adiós.",
    menu: (name) => `Hola, esto es Glucoalarm. Para el resumen de hoy de ${name}, presione 1. Para los niveles bajos y altos recientes, presione 2.`,
    noInput: "No se recibió ninguna entrada. Adiós.",
    noReadings: (name) => `No se encontraron lecturas de Dexcom para ${name} en las últimas 24 horas. Adiós.`,
    summary: (name, mean, gmiText, timeInRangePct) =>
      `El promedio de glucosa de ${name} hoy es ${mean} miligramos por decilitro. El A1C estimado es ${gmiText}. El tiempo en rango es ${timeInRangePct} por ciento. Adiós.`,
    gmiNotAvailable: "no disponible -- aún no hay suficientes datos",
    percent: "por ciento",
    noEvents: (name) => `No se registraron niveles bajos ni altos para ${name} en las últimas 24 horas. Adiós.`,
    events: (name, parts) => `Eventos recientes de ${name}: ${parts}. Adiós.`,
    eventLabel: (direction, value, time) => `${direction === "low" ? "Bajo" : "Alto"} de ${value} a las ${time}`,
    invalidOption: "Lo siento, esa no fue una opción válida. Adiós.",
  },
  pt: {
    notRecognized: "Este número não é reconhecido pelo Glucoalarm. Adeus.",
    menu: (name) => `Olá, aqui é o Glucoalarm. Para o resumo de hoje de ${name}, pressione 1. Para as baixas e altas recentes, pressione 2.`,
    noInput: "Nenhuma entrada recebida. Adeus.",
    noReadings: (name) => `Nenhuma leitura do Dexcom encontrada para ${name} nas últimas 24 horas. Adeus.`,
    summary: (name, mean, gmiText, timeInRangePct) =>
      `A média de glicose de ${name} hoje é ${mean} miligramas por decilitro. O A1C estimado é ${gmiText}. O tempo no intervalo é ${timeInRangePct} por cento. Adeus.`,
    gmiNotAvailable: "não disponível -- ainda não há dados suficientes",
    percent: "por cento",
    noEvents: (name) => `Nenhuma baixa ou alta registrada para ${name} nas últimas 24 horas. Adeus.`,
    events: (name, parts) => `Eventos recentes de ${name}: ${parts}. Adeus.`,
    eventLabel: (direction, value, time) => `${direction === "low" ? "Baixa" : "Alta"} de ${value} às ${time}`,
    invalidOption: "Desculpe, essa não foi uma opção válida. Adeus.",
  },
};

/**
 * Twilio POSTs here both when a call first comes in (no Digits param) and
 * again when the <Gather> below collects a keypress (Digits present) --
 * same URL for both, same pattern as calls-webhook.ts's <Gather> handling.
 * Public/unauthenticated by necessity, verified via Twilio's own signature
 * scheme. Authorization mirrors the WhatsApp bot exactly: caller must be a
 * verified phone_subscribers number (see migration 0022) or they just hear
 * a "not recognized" message -- a wrong number can't call in and hear real
 * data any more than it could text for it. Spoken language follows the
 * calling subscriber's own call_language (migration 0025).
 */
export async function handleVoiceInbound(request: Request, env: Env, now: number): Promise<Response> {
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const signature = request.headers.get("X-Twilio-Signature");

  const valid = await verifyTwilioSignature(env.TWILIO_AUTH, request.url, params, signature);
  if (!valid) {
    console.error("handleVoiceInbound: invalid Twilio signature");
    return new Response("invalid signature", { status: 403 });
  }

  const from = params["From"] ?? "";
  const digits = params["Digits"];

  const person = await env.DB
    .prepare(
      `SELECT people.id as id, people.name as name, people.safe_low as safe_low, people.safe_high as safe_high,
              people.critical_low as critical_low, people.critical_high as critical_high,
              people.timezone as timezone, phone_subscribers.verified_at as verified_at,
              phone_subscribers.call_language as call_language
       FROM phone_subscribers
       JOIN people ON people.id = phone_subscribers.person_id
       JOIN customers ON customers.id = people.customer_id
       WHERE phone_subscribers.phone_number = ? AND customers.subscription_status = 'active'
       LIMIT 1`
    )
    .bind(from)
    .first<VoicePerson>();

  // Not-recognized callers default to English -- there's no subscriber row to read a language from.
  const language = normalizeCallLanguage(person?.call_language);
  const t = IVR_STRINGS[language];
  const say = (text: string) => sayTag(text, language);

  if (!person || !person.verified_at) {
    return twiml(say(t.notRecognized) + "<Hangup/>");
  }

  const actionUrl = `${env.PUBLIC_WORKER_URL}/api/voice/inbound`;
  const menu =
    `<Gather numDigits="1" timeout="10" action="${escapeXml(actionUrl)}" method="POST">` +
    say(t.menu(person.name)) +
    `</Gather>` +
    say(t.noInput);

  if (!digits) {
    return twiml(menu);
  }

  const timezone = person.timezone ?? "UTC";
  const since = now - 24 * 60 * 60;
  const readings = await env.DB
    .prepare(`SELECT value_mgdl, trend, recorded_at FROM readings WHERE person_id = ? AND recorded_at >= ? ORDER BY recorded_at ASC`)
    .bind(person.id, since)
    .all<{ value_mgdl: number; trend: string | null; recorded_at: number }>();

  if (digits === "1") {
    const stats = computeGlucoseStats(readings.results, person);
    if (stats.readingCount === 0) {
      return twiml(say(t.noReadings(person.name)));
    }
    const gmiText = stats.gmi !== null ? `${stats.gmi} ${t.percent}` : t.gmiNotAvailable;
    return twiml(say(t.summary(person.name, stats.mean, gmiText, stats.timeInRangePct)));
  }

  if (digits === "2") {
    const events = detectGlucoseEvents(readings.results, person);
    if (events.length === 0) {
      return twiml(say(t.noEvents(person.name)));
    }
    const recent = [...events].sort((a, b) => b.extremeAt - a.extremeAt).slice(0, 3);
    const parts = recent.map((e) => t.eventLabel(e.direction, e.extremeValue, formatLocalTime(e.extremeAt, timezone)));
    return twiml(say(t.events(person.name, parts.join(". "))));
  }

  return twiml(say(t.invalidOption));
}
