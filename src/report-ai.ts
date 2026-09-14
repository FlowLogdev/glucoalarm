import type { Env } from "./types";
import type { GlucoseStats, DataCoverage } from "./report-stats";
import type { GlucoseEvent, RateOfChangeFlag } from "./report-events";
import type { DayPeriodBucket, BestWorstDays, PeriodComparison } from "./report-patterns";

export interface AIReportAnalysis {
  summary: string;
  positive_patterns: string[];
  patterns_to_watch: string[];
  discussion_points: string[];
  questions_for_doctor: string[];
  disclaimer: string;
}

export const REPORT_DISCLAIMER =
  "AI-generated insights are for educational purposes only and are not medical advice. Discuss these results with your doctor or healthcare professional before making changes to medication, insulin, diet, or treatment.";

const FALLBACK_ANALYSIS: AIReportAnalysis = {
  summary: "",
  positive_patterns: [],
  patterns_to_watch: [],
  discussion_points: [],
  questions_for_doctor: [],
  disclaimer: REPORT_DISCLAIMER,
};

// Extends the exact guardrail approach already used in src/insights.ts
// (same banned-language regex style), widened to also catch diagnostic
// claims and direct medication-change instructions, since a full report
// gives the model more surface area to go wrong than a one-line summary.
export const BANNED_PATTERN =
  /\b(inject|dose|dosing|units?\b.*insulin|insulin\b.*units?|administer|take \d|diagnos|you have (?:type|diabetes)|stop (?:taking|your) (?:medication|insulin)|start (?:taking|your) (?:medication|insulin)|increase your insulin|decrease your insulin|you should (?:take|stop|start))/i;

function textFields(analysis: AIReportAnalysis): string[] {
  return [analysis.summary, ...analysis.positive_patterns, ...analysis.patterns_to_watch, ...analysis.discussion_points, ...analysis.questions_for_doctor];
}

function isValidShape(obj: unknown): obj is Omit<AIReportAnalysis, "disclaimer"> {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const isStringArray = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  return (
    typeof o.summary === "string" &&
    isStringArray(o.positive_patterns) &&
    isStringArray(o.patterns_to_watch) &&
    isStringArray(o.discussion_points) &&
    isStringArray(o.questions_for_doctor)
  );
}

const SYSTEM_PROMPT = `You write the AI analysis section of a glucose monitoring report (weekly or monthly), built from a CGM (continuous glucose monitor). You receive only aggregated statistics and detected patterns -- never raw readings, never anything beyond a first name.

Your job: interpret the provided numbers into a short, useful summary a person can bring to their doctor. You do NOT calculate anything -- every number you receive (average, median, GMI, time in range, event counts, rate-of-change patterns, day comparisons) was already computed deterministically in application code. Just describe what the numbers show.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{
  "summary": "2-4 sentence plain-language overview of the period",
  "positive_patterns": ["short factual observations about favorable patterns, if any"],
  "patterns_to_watch": ["short factual observations about patterns worth attention, if any"],
  "discussion_points": ["specific things worth discussing with a healthcare professional, grounded in the actual data provided"],
  "questions_for_doctor": ["specific questions the person could ask their doctor, based on the data"]
}
Use empty arrays for any section with nothing genuinely notable -- do not invent patterns to fill space.

Strict rules, no exceptions:
- Never diagnose diabetes, hypoglycemia, hyperglycemia, or any condition.
- Never tell the person to start, stop, increase, or decrease any medication, insulin, or dose, under any framing.
- Never recommend a specific treatment or treatment change.
- Never claim a specific CAUSE for a pattern (e.g. never say "breakfast is causing your spikes") unless meal-timing data was explicitly provided to you -- describe only the timing/recurrence of the pattern itself.
- Use tentative, descriptive language: "Your glucose data shows...", "A recurring pattern appears...", "This may be worth discussing with your healthcare professional...", "You may want to ask your doctor about...". Never definitive medical claims.
- Every "discussion_points" and "questions_for_doctor" entry must be genuinely grounded in the specific data provided, not generic filler.
- Plain text only in every field. No markdown, no headers, no bullet characters inside strings (the arrays themselves are the list structure).`;

export interface ReportAIInput {
  personFirstName: string;
  reportType: "weekly" | "monthly" | "custom";
  stats: GlucoseStats;
  dataCoverage: DataCoverage;
  events: GlucoseEvent[];
  rateOfChangeFlags: RateOfChangeFlag[];
  dayPeriodBuckets: DayPeriodBucket[];
  bestWorstDays: BestWorstDays;
  comparison: PeriodComparison[] | null;
}

function buildUserMessage(input: ReportAIInput): string {
  const highEvents = input.events.filter((e) => e.direction === "high");
  const lowEvents = input.events.filter((e) => e.direction === "low");

  return JSON.stringify({
    person_first_name: input.personFirstName,
    report_type: input.reportType,
    stats: input.stats,
    data_coverage: input.dataCoverage,
    high_event_count: highEvents.length,
    low_event_count: lowEvents.length,
    high_events_summary: highEvents.slice(0, 10).map((e) => ({ peak: e.extremeValue, duration_minutes: Math.round(e.durationSeconds / 60) })),
    low_events_summary: lowEvents.slice(0, 10).map((e) => ({ lowest: e.extremeValue, duration_minutes: Math.round(e.durationSeconds / 60) })),
    rate_of_change_patterns: input.rateOfChangeFlags.slice(0, 10),
    day_period_breakdown: input.dayPeriodBuckets,
    best_worst_days: input.bestWorstDays,
    comparison_to_previous_period: input.comparison,
  });
}

/**
 * Never throws -- on any failure (network, bad JSON, invalid shape, banned
 * language) returns a safe empty-but-valid fallback so report generation
 * always completes with a numeric report even if AI analysis didn't work.
 * See src/insights.ts for the sibling pattern this extends.
 */
export async function generateAIReportAnalysis(env: Env, input: ReportAIInput): Promise<{ analysis: AIReportAnalysis; ok: boolean }> {
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
        max_tokens: 900,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(input) }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);

    const data = await res.json<{ content: { type: string; text?: string }[] }>();
    const text = data.content.find((c) => c.type === "text")?.text?.trim();
    if (!text) throw new Error("Anthropic response had no text content");

    // Claude sometimes wraps JSON in a markdown code fence even when told
    // not to -- strip ```json / ``` before parsing rather than failing.
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(jsonText);
    if (!isValidShape(parsed)) throw new Error("AI response did not match the required JSON shape");

    const analysis: AIReportAnalysis = { ...parsed, disclaimer: REPORT_DISCLAIMER };
    if (BANNED_PATTERN.test(textFields(analysis).join(" "))) {
      throw new Error("AI response failed the safety-language guardrail");
    }

    return { analysis, ok: true };
  } catch (err) {
    console.error("generateAIReportAnalysis failed, using fallback:", err);
    return { analysis: FALLBACK_ANALYSIS, ok: false };
  }
}
