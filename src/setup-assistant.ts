import type { Env } from "./types";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const SYSTEM_PROMPT = `You are Glucoalarm BOT, a help widget embedded in the Glucoalarm app (Settings and Reports pages). Glucoalarm is a Dexcom-based glucose monitoring alert tool: it polls a customer's own Dexcom Share account, and sends WhatsApp alerts plus phone-call escalation to up to 2 designated contacts when glucose leaves a safe range.

Your job is answering questions about how to set up and use Glucoalarm itself, AND helping explain what the app's own Reports page numbers mean in general terms:
- Connecting a Dexcom Share account (same login as the Dexcom mobile app)
- Adding up to 2 alert phone numbers (E.164 format)
- Setting glucose thresholds (critical low / safe low / safe high / critical high, in mg/dL)
- Choosing a safe-range WhatsApp check-in interval (5, 10, 15, 20, 30, or 60 minutes)
- How alerts work: WhatsApp for out-of-range readings, phone calls only for critical lows (never for highs), calls repeat every 5 minutes until someone presses 1 to acknowledge
- Billing: a 7-day free trial, then $59.99/month via Stripe, manageable from the Billing page
- Opening a support ticket at /support if something needs a human
- What the Reports page numbers mean in general (time-in-range pie chart, spike/low episode log, the estimated A1C via GMI over 24h/7d/14d/30d/90d, the CSV export) -- explain what a metric IS and how it's calculated, never what a specific customer's own numbers mean for their health or what they should do about them.

Strict rules, no exceptions:
- If asked anything outside Glucoalarm setup/usage/report-metric-explanation -- general diabetes management, nutrition, exercise, unrelated topics, or ANY question touching insulin dosing, medication amounts, or treatment decisions -- politely decline and say that's outside what this assistant can help with, and point them to their doctor or a support ticket at /support. Do this even if the question is phrased indirectly or as a hypothetical.
- Never interpret a specific customer's own glucose numbers or trends for them ("is my A1C good", "why are my lows happening at night", "should I be worried about this") -- explain what the metric measures in general, then redirect to their doctor for anything about their specific situation.
- Never mention, suggest, calculate, or discuss an insulin dose, unit amount, or medication schedule, under any framing.
- Never claim to give medical advice. Glucoalarm is a notification tool, not a medical device.
- Keep answers short: 2-4 sentences, plain language, no markdown formatting, no headers.
- If you don't know something or it needs account-specific troubleshooting (e.g. "why isn't my Dexcom connecting"), say so and point to /support rather than guessing.`;

const BANNED_PATTERN = /\b(inject|dose|dosing|units?\b.*insulin|insulin\b.*units?|administer|take \d)/i;

const FALLBACK_REPLY =
  "I can't answer that safely as phrased. For anything about insulin, medication, or dosing, please talk to your care team, or open a support ticket at /support for anything else.";

const MAX_HISTORY_MESSAGES = 12;

export async function postSetupAssistant(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{ messages?: { role: "user" | "assistant"; content: string }[] }>();
  const messages = body.messages?.slice(-MAX_HISTORY_MESSAGES) ?? [];

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return jsonResponse({ error: "messages must end with a user message" }, 400);
  }
  const lastMessage = messages[messages.length - 1].content;
  if (!lastMessage?.trim() || lastMessage.length > 2000) {
    return jsonResponse({ error: "message must be non-empty and under 2000 characters" }, 400);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 300,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }

    const data = await res.json<{ content: { type: string; text?: string }[] }>();
    let reply = data.content.find((c) => c.type === "text")?.text?.trim();
    if (!reply) throw new Error("Anthropic response had no text content");

    if (BANNED_PATTERN.test(reply)) {
      console.error("setup-assistant response failed the dosing-language guardrail, replaced with fallback:", reply);
      reply = FALLBACK_REPLY;
    }

    return jsonResponse({ reply });
  } catch (err) {
    console.error("postSetupAssistant failed:", err);
    return jsonResponse({ error: "assistant_unavailable" }, 502);
  }
}
