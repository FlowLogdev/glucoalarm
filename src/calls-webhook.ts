import { verifyTwilioSignature } from "./lib/twilio-verify";
import { sayTag, normalizeCallLanguage, type CallLanguage } from "./lib/voice-i18n";
import { LOW_CALL_ACK_CRITICAL, LOW_CALL_ACK_WARN } from "./lib/alerts";
import type { Env } from "./types";

function twiml(sayText: string, language: CallLanguage, status = 200): Response {
  const body = `<Response>${sayTag(sayText, language)}</Response>`;
  return new Response(body, { status, headers: { "Content-Type": "text/xml" } });
}

const ACK_STRINGS: Record<CallLanguage, { acknowledged: string; acknowledgedWarn: string; noAck: string }> = {
  en: {
    acknowledged: "Acknowledged. You will not receive more calls for this low. Goodbye.",
    acknowledgedWarn: "Acknowledged. Repeat calls will stop unless the glucose becomes critical. Goodbye.",
    noAck: "No acknowledgment received. You may receive another call shortly. Goodbye.",
  },
  es: {
    acknowledged: "Confirmado. No recibirá más llamadas por este nivel bajo. Adiós.",
    acknowledgedWarn: "Confirmado. Las llamadas repetidas se detendrán, salvo que la glucosa llegue a un nivel crítico. Adiós.",
    noAck: "No se recibió confirmación. Es posible que reciba otra llamada en breve. Adiós.",
  },
  pt: {
    acknowledged: "Confirmado. Você não receberá mais ligações sobre este nível baixo. Adeus.",
    acknowledgedWarn: "Confirmado. As ligações repetidas vão parar, a menos que a glicose chegue a um nível crítico. Adeus.",
    noAck: "Nenhuma confirmação recebida. Você pode receber outra ligação em breve. Adeus.",
  },
};

/**
 * Twilio POSTs here after a low-glucose call's <Gather> completes (digit
 * pressed, or timed out with none). Public/unauthenticated by necessity --
 * Twilio can't send our admin bearer token -- so the request is verified
 * via Twilio's own signature scheme instead. See src/lib/twilio-verify.ts
 * for why that check isn't optional here: this endpoint can silence real
 * low-glucose calls, so it can't be left open to anyone who finds the URL.
 * `call_language` is passed through as a query param by makeVoiceCall (it
 * already knows the subscriber's language when it builds this action URL),
 * so error/edge-path messages before that's confirmed default to English.
 * `ack_level` says which severity the call was about (see isLowCallSilenced);
 * MAX keeps a critical ack from being downgraded by a late warn-call keypress.
 */
export async function handleCallAck(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const personId = url.searchParams.get("person_id");
  const language = normalizeCallLanguage(url.searchParams.get("call_language"));
  const bodyText = await request.text();
  const params = Object.fromEntries(new URLSearchParams(bodyText));
  const signature = request.headers.get("X-Twilio-Signature");

  const valid = await verifyTwilioSignature(env.TWILIO_AUTH, request.url, params, signature);
  if (!valid) {
    console.error("handleCallAck: invalid Twilio signature");
    return twiml("This request could not be verified. Goodbye.", "en", 403);
  }
  if (!personId) {
    return twiml("Missing person. Goodbye.", "en", 400);
  }

  const t = ACK_STRINGS[language];

  if (params["Digits"] === "1") {
    const critical = url.searchParams.get("ack_level") === "critical";
    const result = await env.DB
      .prepare(`UPDATE people SET low_call_acknowledged = MAX(low_call_acknowledged, ?) WHERE id = ?`)
      .bind(critical ? LOW_CALL_ACK_CRITICAL : LOW_CALL_ACK_WARN, personId)
      .run();
    if (result.meta.changes === 0) return twiml("Unknown person. Goodbye.", "en", 404);
    return twiml(critical ? t.acknowledged : t.acknowledgedWarn, language);
  }

  return twiml(t.noAck, language);
}
