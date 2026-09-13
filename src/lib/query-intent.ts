import type { Env } from "../types";

export interface QueryIntent {
  range_days: 1 | 7 | 14 | 30 | 90;
  metric: "summary" | "a1c" | "time_in_range" | "time_of_day" | "email_report";
}

const VALID_RANGES = new Set([1, 7, 14, 30, 90]);
const VALID_METRICS = new Set(["summary", "a1c", "time_in_range", "time_of_day", "email_report"]);
const DEFAULT_INTENT: QueryIntent = { range_days: 1, metric: "summary" };

const SYSTEM_PROMPT = `Parse a WhatsApp message asking about glucose data into JSON only, no other text: {"range_days": 1|7|14|30|90, "metric": "summary"|"a1c"|"time_in_range"|"time_of_day"|"email_report"}.

range_days: map "today"/"now"/no timeframe mentioned -> 1 (except see the email_report override below). "week"/"7 days" -> 7. "two weeks" -> 14. "month"/"30 days" -> 30. "3 months"/"quarter"/"90 days" -> 90. Round anything else to the nearest of these five values. If metric is "email_report" and no timeframe is mentioned, use 7 instead of 1 -- a "report" implies a real window, not just the last 24 hours.
metric: "a1c"/"A1C"/"GMI" mentioned and nothing else -> "a1c". "time in range"/"TIR"/"range" mentioned and nothing else -> "time_in_range". Asking what time of day lows/highs happen, or to compare times of day -> "time_of_day". Asking to email, send, or generate a report, or for the data/CSV/Excel -> "email_report". Otherwise, or if unclear -> "summary".

Output only the JSON object, nothing else.`;

/**
 * Same guarded-call shape as setup-assistant.ts: cheap/fast model call,
 * strict system prompt, JSON-only output. Unlike setup-assistant.ts this
 * never reaches a person's actual glucose numbers -- it only ever sees the
 * short command text and returns a {range_days, metric} selector. Any
 * failure (network, bad JSON, out-of-allow-list values) falls back to the
 * default rather than erroring, so a flaky Claude response never blocks
 * the reply -- worst case the customer gets the last-24h summary instead
 * of exactly what they asked for.
 */
export async function parseQueryIntent(env: Env, rawMessage: string): Promise<QueryIntent> {
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
        max_tokens: 60,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: rawMessage.slice(0, 500) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error (${res.status})`);

    const data = await res.json<{ content: { type: string; text?: string }[] }>();
    const text = data.content.find((c) => c.type === "text")?.text?.trim();
    if (!text) throw new Error("no text content");

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { range_days?: unknown; metric?: unknown };

    const range_days = VALID_RANGES.has(Number(parsed.range_days)) ? (Number(parsed.range_days) as QueryIntent["range_days"]) : DEFAULT_INTENT.range_days;
    const metric = VALID_METRICS.has(String(parsed.metric)) ? (parsed.metric as QueryIntent["metric"]) : DEFAULT_INTENT.metric;

    return { range_days, metric };
  } catch (err) {
    console.error("parseQueryIntent failed, using default intent:", err);
    return DEFAULT_INTENT;
  }
}
