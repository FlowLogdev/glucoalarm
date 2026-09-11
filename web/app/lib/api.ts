export interface Person {
  id: string;
  name: string;
  safe_low: number;
  safe_high: number;
  critical_low: number;
  critical_high: number;
  stale_minutes: number;
  carb_ratio: number | null;
  correction_factor: number | null;
  target_glucose: number | null;
  timezone: string | null;
  ticker_interval_minutes?: number;
}

export interface Insight {
  summary: string;
  generated_at: number;
}

export interface InsulinLogEntry {
  id: number;
  person_id: string;
  logged_at: number;
  carbs_grams: number | null;
  food_description: string | null;
  glucose_at_dose: number | null;
  dose_units: number | null;
  note: string | null;
}

export interface Reading {
  value_mgdl: number;
  trend: string;
  recorded_at: number;
  received_at?: number;
}

export type Status = "safe" | "warn_low" | "critical_low" | "warn_high" | "critical_high" | "stale" | "no_data";

export type ReportPeriod = "week" | "biweek" | "month";

export interface ReadingsByTier {
  safe: number;
  warn_low: number;
  critical_low: number;
  warn_high: number;
  critical_high: number;
  total: number;
}

export interface Episode {
  direction: "low" | "high";
  reachedCritical: boolean;
  startAt: number;
  endAt: number;
  extremeValue: number;
  ongoing: boolean;
}

export interface Report {
  period: { key: ReportPeriod; label: string; startAt: number; endAt: number };
  readingsByTier: ReadingsByTier;
  episodes: Episode[];
}

export interface LatestReadingResponse {
  person: Person;
  reading: Reading | null;
  status: Status;
  now: number;
}

export interface Subscriber {
  id: number;
  person_id: string;
  phone_number: string;
  label: string | null;
}

/** All data calls go through the same-origin proxy (app/api/proxy/[...path]),
 *  which attaches the session's bearer token server-side. The browser never
 *  talks to the Worker directly, and never sees the token. */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getPeople(): Promise<Person[]> {
  return apiFetch<Person[]>("/people");
}

export function getLatestReading(personId: string): Promise<LatestReadingResponse> {
  return apiFetch<LatestReadingResponse>(`/readings/latest?person_id=${encodeURIComponent(personId)}`);
}

export function getHistory(personId: string, hours: number): Promise<Reading[]> {
  return apiFetch<Reading[]>(`/readings/history?person_id=${encodeURIComponent(personId)}&hours=${hours}`);
}

export function getSubscribers(personId: string): Promise<Subscriber[]> {
  return apiFetch<Subscriber[]>(`/subscribers?person_id=${encodeURIComponent(personId)}`);
}

export function addSubscriber(personId: string, phoneNumber: string, label: string): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/subscribers", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, phone_number: phoneNumber, label }),
  });
}

export function removeSubscriber(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/subscribers/${id}`, { method: "DELETE" });
}

export function updateThresholds(
  personId: string,
  safeLow: number,
  safeHigh: number,
  criticalLow: number,
  criticalHigh: number,
  staleMinutes: number
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/settings/thresholds", {
    method: "POST",
    body: JSON.stringify({
      person_id: personId,
      safe_low: safeLow,
      safe_high: safeHigh,
      critical_low: criticalLow,
      critical_high: criticalHigh,
      stale_minutes: staleMinutes,
    }),
  });
}

export function updateDosingSettings(
  personId: string,
  carbRatio: number | null,
  correctionFactor: number | null,
  targetGlucose: number | null
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/settings/dosing", {
    method: "POST",
    body: JSON.stringify({
      person_id: personId,
      carb_ratio: carbRatio,
      correction_factor: correctionFactor,
      target_glucose: targetGlucose,
    }),
  });
}

export function getInsulinLog(personId: string, hours = 720): Promise<InsulinLogEntry[]> {
  return apiFetch<InsulinLogEntry[]>(`/insulin-log?person_id=${encodeURIComponent(personId)}&hours=${hours}`);
}

export function addInsulinLogEntry(entry: {
  personId: string;
  carbsGrams: number | null;
  foodDescription: string;
  glucoseAtDose: number | null;
  doseUnits: number | null;
  note: string;
}): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/insulin-log", {
    method: "POST",
    body: JSON.stringify({
      person_id: entry.personId,
      carbs_grams: entry.carbsGrams,
      food_description: entry.foodDescription || null,
      glucose_at_dose: entry.glucoseAtDose,
      dose_units: entry.doseUnits,
      note: entry.note || null,
    }),
  });
}

export function removeInsulinLogEntry(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/insulin-log/${id}`, { method: "DELETE" });
}

export interface A1CEstimate {
  key: string;
  label: string;
  averageMgdl: number | null;
  estimatedA1c: number | null;
  readingCount: number;
}

export function getA1CEstimates(personId: string): Promise<A1CEstimate[]> {
  return apiFetch<A1CEstimate[]>(`/a1c?person_id=${encodeURIComponent(personId)}`);
}

export interface A1CRecord {
  id: number;
  a1c_value: number;
  measured_at: number;
  source: string | null;
  notes: string | null;
}

export function getA1CRecords(personId: string): Promise<A1CRecord[]> {
  return apiFetch<A1CRecord[]>(`/a1c-records?person_id=${encodeURIComponent(personId)}`);
}

export function addA1CRecord(personId: string, a1cValue: number, measuredAt: number, source: string): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/a1c-records", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, a1c_value: a1cValue, measured_at: measuredAt, source: source || null }),
  });
}

export function removeA1CRecord(personId: string, id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/a1c-records/${id}?person_id=${encodeURIComponent(personId)}`, { method: "DELETE" });
}

export interface GlucoseReportMetrics {
  readingCount: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
  gmi: number | null;
  timeInRangePct: number | null;
  timeAboveRangePct: number | null;
  timeBelowRangePct: number | null;
}

export interface GlucoseReportDataCoverage {
  readingCount: number;
  daysWithData: number;
  expectedReadings: number;
  coveragePct: number;
  isLimited: boolean;
  gmiReliable: boolean;
}

export interface GlucoseReportComparison {
  metric: string;
  current: number | null;
  previous: number | null;
  difference: number | null;
  percentChange: number | null;
  unit: "percentage_points" | "value";
}

export interface GlucoseReportPatterns {
  dayPeriodBuckets: { period: string; readingCount: number; timeInRangePct: number | null; timeLowPct: number | null; timeHighPct: number | null; meanGlucose: number | null }[];
  bestWorstDays: Record<string, { date: string; timeInRangePct: number | null; meanGlucose: number | null; stdev: number | null } | null>;
  comparison: GlucoseReportComparison[] | null;
  rateOfChangeFlags: { direction: string; hour: number; occurrences: number }[];
  highEventCount: number;
  lowEventCount: number;
  events: { direction: string; startAt: number; endAt: number; durationSeconds: number; extremeValue: number }[];
}

export interface AIReportAnalysis {
  summary: string;
  positive_patterns: string[];
  patterns_to_watch: string[];
  discussion_points: string[];
  questions_for_doctor: string[];
  disclaimer: string;
}

export interface GlucoseReport {
  id: number;
  period_start: number;
  period_end: number;
  metrics: GlucoseReportMetrics;
  patterns: GlucoseReportPatterns | null;
  ai_analysis: AIReportAnalysis | null;
  data_coverage: GlucoseReportDataCoverage;
  status: string;
  generated_at: number;
}

export async function getGlucoseReport(personId: string, type: "weekly" | "monthly"): Promise<GlucoseReport | null> {
  return apiFetch<GlucoseReport | null>(`/glucose-reports?person_id=${encodeURIComponent(personId)}&type=${type}`);
}

export function getReport(personId: string, period: ReportPeriod): Promise<Report> {
  return apiFetch<Report>(`/reports?person_id=${encodeURIComponent(personId)}&period=${period}`);
}

export function updateTimezone(personId: string, timezone: string | null): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/settings/timezone", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, timezone }),
  });
}

export function getInsight(personId: string, period: ReportPeriod): Promise<Insight | null> {
  return apiFetch<Insight | null>(`/insights?person_id=${encodeURIComponent(personId)}&period=${period}`);
}

export function generateInsight(personId: string, period: ReportPeriod): Promise<Insight> {
  return apiFetch<Insight>("/insights/generate", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, period }),
  });
}

export interface BillingInfo {
  display_name: string;
  subscription_status: string;
  has_billing_account: boolean;
}

export function getBilling(): Promise<BillingInfo> {
  return apiFetch<BillingInfo>("/billing");
}

export async function openBillingPortal(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>("/billing/portal", { method: "POST", body: JSON.stringify({}) });
  window.location.href = url;
}

export interface SupportTicket {
  id: number;
  subject: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface SupportTicketMessage {
  id: number;
  is_staff: number;
  body: string;
  created_at: number;
}

export async function checkLoggedIn(): Promise<boolean> {
  const res = await fetch("/api/whoami", { cache: "no-store" });
  if (!res.ok) return false;
  const data = (await res.json()) as { loggedIn: boolean };
  return data.loggedIn;
}

export async function createPublicTicket(fields: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  description: string;
}): Promise<{ ticket_number: string }> {
  const res = await fetch("/api/support/public-tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      first_name: fields.firstName,
      last_name: fields.lastName,
      email: fields.email,
      phone: fields.phone || null,
      subject: fields.subject,
      description: fields.description,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Couldn't submit your ticket. Try again.");
  }
  return res.json();
}

export function getTickets(): Promise<SupportTicket[]> {
  return apiFetch<SupportTicket[]>("/support/tickets");
}

export function getTicket(id: number): Promise<{ ticket: SupportTicket; messages: SupportTicketMessage[] }> {
  return apiFetch(`/support/tickets/${id}`);
}

export function createTicket(subject: string, message: string): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/support/tickets", { method: "POST", body: JSON.stringify({ subject, message }) });
}

export function replyToTicket(id: number, message: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/support/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ message }) });
}

export interface ServiceStatus {
  status: "connected" | "connecting" | "down";
  detail: string;
  lastReadingAt: number | null;
  subscriptionStatus: string;
}

export function getServiceStatus(personId: string): Promise<ServiceStatus> {
  return apiFetch<ServiceStatus>(`/status?person_id=${encodeURIComponent(personId)}`);
}

export function restartService(personId: string): Promise<ServiceStatus> {
  return apiFetch<ServiceStatus>("/restart-service", { method: "POST", body: JSON.stringify({ person_id: personId }) });
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export function sendSetupAssistantMessage(messages: AssistantMessage[]): Promise<{ reply: string }> {
  return apiFetch<{ reply: string }>("/setup-assistant", { method: "POST", body: JSON.stringify({ messages }) });
}

export interface CurrentAdmin {
  email: string;
  role: "owner" | "doctor";
  is_super_admin: boolean;
}

export function getCurrentAdmin(): Promise<CurrentAdmin> {
  return apiFetch<CurrentAdmin>("/me");
}

export interface Doctor {
  id: string;
  email: string;
  created_at: number;
}

export function getDoctors(): Promise<Doctor[]> {
  return apiFetch<Doctor[]>("/doctors");
}

export function inviteDoctor(email: string, name: string): Promise<{ id: string; email: string }> {
  return apiFetch<{ id: string; email: string }>("/doctors/invite", {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
}

export function removeDoctor(id: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/doctors/${id}`, { method: "DELETE" });
}

export function updateTickerInterval(personId: string, minutes: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/settings/ticker-interval", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, ticker_interval_minutes: minutes }),
  });
}

export function connectDexcom(name: string, dexcomUsername: string, dexcomPassword: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/people", {
    method: "POST",
    body: JSON.stringify({ name, dexcom_username: dexcomUsername, dexcom_password: dexcomPassword }),
  });
}

/** Signup/onboarding calls go straight to their own Next.js routes (not the
 *  authenticated proxy) -- no session exists yet at this point in the flow. */
export async function startSignupCheckout(): Promise<{ url: string }> {
  const res = await fetch("/api/signup/checkout", { method: "POST" });
  if (!res.ok) throw new Error("Couldn't start checkout. Try again.");
  return res.json();
}

export async function completeSignup(
  sessionId: string,
  displayName: string,
  email: string,
  password: string
): Promise<void> {
  const res = await fetch("/api/signup/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, display_name: displayName, email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const messages: Record<string, string> = {
      payment_not_confirmed: "We couldn't confirm your payment yet. Try refreshing in a moment.",
      email_already_registered: "That email is already registered -- log in instead.",
      session_already_used: "This checkout session was already used to create an account.",
    };
    throw new Error(messages[body.error as string] ?? "Couldn't complete signup. Try again.");
  }
}
