import { formatLocalDate, formatLocalTime } from "./lib/time-format";
import type { Env } from "./types";

export type InsulinType = "fast_acting" | "long_acting";

export interface InsulinLogEntry {
  id: number;
  logged_at: number;
  insulin_type: InsulinType;
  dose_units: number;
  glucose_at_dose: number | null;
  glucose_recorded_at: number | null;
}

export type InsulinCommand = { kind: "status" } | { kind: "log"; insulinType: InsulinType; doseUnits: number } | null;
const LOG_COMMAND = /^\/?log\s+(?:(?:insulin|insuline)\s+)?(fast(?:[-\s]?acting)?|rapid(?:[-\s]?acting)?|long(?:[-\s]?acting)?|basal)\s+(\d+(?:\.\d{1,2})?)\s*(?:u|units?)?\s*$/i;

/** Deterministic command parser. Never route insulin entries through the AI chat path. */
export function parseInsulinCommand(message: string): InsulinCommand {
  const normalized = message.trim();
  if (/^\/?log\s+status\s*$/i.test(normalized)) return { kind: "status" };
  const match = LOG_COMMAND.exec(normalized);
  if (!match) return null;
  const doseUnits = Number(match[2]);
  if (!Number.isFinite(doseUnits) || doseUnits <= 0 || doseUnits > 200) return null;
  return { kind: "log", insulinType: /^(long|basal)/i.test(match[1]) ? "long_acting" : "fast_acting", doseUnits };
}

function localMidnightEpoch(referenceEpoch: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(referenceEpoch * 1000));
  const value = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? "0");
  return referenceEpoch - ((value("hour") % 24) * 3600 + value("minute") * 60 + value("second"));
}

export async function createInsulinLog(env: Env, personId: string, insulinType: InsulinType, doseUnits: number, loggedAt: number): Promise<InsulinLogEntry> {
  // Dexcom supplies a reading about every five minutes. A 15-minute window
  // avoids presenting an unrelated, stale number as if it were contemporaneous.
  const nearest = await env.DB.prepare(`SELECT value_mgdl, recorded_at FROM readings WHERE person_id = ? AND recorded_at BETWEEN ? AND ? ORDER BY ABS(recorded_at - ?) ASC LIMIT 1`).bind(personId, loggedAt - 15 * 60, loggedAt + 15 * 60, loggedAt).first<{ value_mgdl: number; recorded_at: number }>();
  const inserted = await env.DB.prepare(`INSERT INTO insulin_log (person_id, logged_at, insulin_type, dose_units, glucose_at_dose, glucose_recorded_at, source) VALUES (?, ?, ?, ?, ?, ?, 'whatsapp')`).bind(personId, loggedAt, insulinType, doseUnits, nearest?.value_mgdl ?? null, nearest?.recorded_at ?? null).run();
  return { id: Number(inserted.meta.last_row_id), logged_at: loggedAt, insulin_type: insulinType, dose_units: doseUnits, glucose_at_dose: nearest?.value_mgdl ?? null, glucose_recorded_at: nearest?.recorded_at ?? null };
}

export async function getInsulinLogs(env: Env, personId: string, now: number, timezone: string, days = 1): Promise<InsulinLogEntry[]> {
  const since = days === 1 ? localMidnightEpoch(now, timezone) : now - days * 24 * 60 * 60;
  const logs = await env.DB.prepare(`SELECT id, logged_at, insulin_type, dose_units, glucose_at_dose, glucose_recorded_at FROM insulin_log WHERE person_id = ? AND logged_at >= ? ORDER BY logged_at DESC`).bind(personId, since).all<InsulinLogEntry>();
  return logs.results;
}

function typeLabel(type: InsulinType): string { return type === "fast_acting" ? "Fast-acting" : "Long-acting"; }
function formatDose(units: number): string { return Number.isInteger(units) ? String(units) : units.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); }
function glucoseLabel(entry: InsulinLogEntry, timezone: string): string { if (entry.glucose_at_dose == null) return "no CGM reading within 15 min"; return `${entry.glucose_at_dose} mg/dL${entry.glucose_recorded_at ? ` at ${formatLocalTime(entry.glucose_recorded_at, timezone)}` : ""}`; }

export function formatInsulinLoggedReply(entry: InsulinLogEntry, timezone: string): string {
  return [`Recorded: ${typeLabel(entry.insulin_type)} insulin — ${formatDose(entry.dose_units)} units`, `${formatLocalDate(entry.logged_at, timezone)} at ${formatLocalTime(entry.logged_at, timezone)}`, `Glucose: ${glucoseLabel(entry, timezone)}.`, "Record only — GlucoAlarm does not recommend insulin doses."].join("\n");
}

export function formatInsulinStatusReply(name: string, logs: InsulinLogEntry[], now: number, timezone: string): string {
  const heading = `${name}'s insulin log — ${formatLocalDate(now, timezone)}`;
  if (!logs.length) return `${heading}\nNo insulin entries recorded today.\n\nRecord only — GlucoAlarm does not recommend insulin doses.`;
  const lines = logs.map((entry) => `• ${formatLocalTime(entry.logged_at, timezone)} — ${typeLabel(entry.insulin_type)}: ${formatDose(entry.dose_units)} units — glucose ${glucoseLabel(entry, timezone)}`);
  return `${heading}\n${lines.join("\n")}\n\nRecord only — GlucoAlarm does not recommend insulin doses.`;
}
