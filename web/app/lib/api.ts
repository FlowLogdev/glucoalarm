export interface Person {
  id: string;
  name: string;
  safe_low: number;
  safe_high: number;
  critical_low: number;
  critical_high: number;
  stale_minutes: number;
}

export interface Reading {
  value_mgdl: number;
  trend: string;
  recorded_at: number;
  received_at?: number;
}

export type Status = "safe" | "warn_low" | "critical_low" | "warn_high" | "critical_high" | "stale" | "no_data";

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
