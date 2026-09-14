import type { Env } from "../types";
import type { ThresholdBand } from "./alerts";
import type { GlucoseStats } from "../report-stats";
import type { DayPeriodBucket } from "../report-patterns";
import { BANNED_PATTERN } from "../report-ai";

export interface FormattedEvent {
  direction: "high" | "low";
  extremeValue: number;
  when: string; // already formatted in the person's local timezone -- never hand Claude a raw epoch to do date math on
  durationMinutes: number;
}

// Trilingual, not language-switched -- this fires when we can't trust the
// model's own output (guardrail hit or a hard failure), so it's safest to
// say it plainly in all three rather than risk phrasing it wrong.
const FALLBACK_REPLY =
  "I can't answer that safely as phrased. For anything about insulin, medication, dosing, or treatment decisions, please talk to Felipe's care team. / Não posso responder isso com segurança. Para qualquer coisa sobre insulina, medicação ou tratamento, fale com a equipe médica de Felipe. / No puedo responder eso de forma segura. Para cualquier cosa sobre insulina, medicación o tratamiento, hable con el equipo médico de Felipe.";

const SYSTEM_PROMPT = `You are Glucoalarm's WhatsApp assistant, answering a family member's question about a specific patient's glucose monitoring data. You receive only pre-computed statistics and detected patterns for the period they asked about -- never raw readings, never anything about insulin, carb ratios, correction factors, or dosing configuration (you are never given that data, so never guess at it).

Your job: describe what the numbers show, in plain conversational language, referencing the specific data provided. You do NOT calculate anything -- every number you receive was already computed deterministically in application code.

Respond in the language given as "language" in the data block -- "pt" means reply in Portuguese, "es" means reply in Spanish, "en" (or anything else) means reply in English. Match the customer's language exactly, every reply, including the doctor-redirect below.

Strict rules, no exceptions, in every language:
- If asked what to do, how to prevent, how to treat, whether to adjust anything, or any other care/treatment decision, do NOT answer it. Reply briefly that this is a question for their doctor or care team, and that you can describe patterns but not recommend actions. Do this even if the question is phrased indirectly, hypothetically, or as "just curious."
- Never diagnose diabetes, hypoglycemia, hyperglycemia, or any condition.
- Never mention, suggest, calculate, or discuss an insulin dose, unit amount, or medication schedule, under any framing.
- Never claim a specific CAUSE for a pattern unless the data explicitly shows the timing/recurrence -- describe only what the numbers show, not why it's happening.
- Use tentative, descriptive language: "the data shows...", "there's a recurring pattern of...". Never definitive medical claims.
- Keep replies short: 1-4 sentences, plain text, no markdown, no headers, no bullet points -- this is a WhatsApp message.
- If you don't have enough data to answer specifically, say so rather than guessing.`;

export interface BotChatInput {
  personName: string;
  thresholds: ThresholdBand;
  rangeLabel: string;
  stats: GlucoseStats;
  events: FormattedEvent[];
  dayPeriodBuckets: DayPeriodBucket[];
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
  language: "en" | "pt" | "es";
}

function buildDataMessage(input: BotChatInput): string {
  return JSON.stringify({
    person_first_name: input.personName,
    safe_range_mg_dl: `${input.thresholds.safe_low}-${input.thresholds.safe_high}`,
    period: input.rangeLabel,
    stats: input.stats,
    recent_events: input.events.slice(0, 8).map((e) => ({
      direction: e.direction,
      extreme_value: e.extremeValue,
      when: e.when,
      duration_minutes: e.durationMinutes,
    })),
    day_period_breakdown: input.dayPeriodBuckets,
    language: input.language,
    question: input.message,
  });
}

/**
 * Same guarded-call shape as report-ai.ts/setup-assistant.ts: strict system
 * prompt, banned-language regex guardrail (imported, not duplicated), safe
 * canned fallback on any failure. Unlike report-ai.ts this returns plain
 * text (a chat reply), not structured JSON, and unlike setup-assistant.ts
 * it's grounded in a specific patient's actual computed data rather than
 * only general app-usage questions.
 */
export async function generateBotChatReply(env: Env, input: BotChatInput): Promise<{ reply: string; ok: boolean }> {
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
        max_tokens: 250,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [...input.history, { role: "user", content: buildDataMessage(input) }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);

    const data = await res.json<{ content: { type: string; text?: string }[] }>();
    let reply = data.content.find((c) => c.type === "text")?.text?.trim();
    if (!reply) throw new Error("Anthropic response had no text content");

    if (BANNED_PATTERN.test(reply)) {
      console.error("generateBotChatReply: response failed the safety-language guardrail, replaced with fallback:", reply);
      reply = FALLBACK_REPLY;
      return { reply, ok: false };
    }

    return { reply, ok: true };
  } catch (err) {
    console.error("generateBotChatReply failed, using fallback:", err);
    return { reply: FALLBACK_REPLY, ok: false };
  }
}
