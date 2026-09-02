const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

export interface Person {
  id: string;
  name: string;
  low_threshold: number;
  high_threshold: number;
  stale_minutes: number;
}

export interface Reading {
  value_mgdl: number;
  trend: string;
  recorded_at: number;
  received_at?: number;
}

export type Status = "high" | "low" | "in_range" | "stale" | "no_data";

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getPeople(): Promise<Person[]> {
  return apiFetch<Person[]>("/api/people");
}

export function getLatestReading(personId: string): Promise<LatestReadingResponse> {
  return apiFetch<LatestReadingResponse>(
    `/api/readings/latest?person_id=${encodeURIComponent(personId)}`
  );
}

export function getHistory(personId: string, hours: number): Promise<Reading[]> {
  return apiFetch<Reading[]>(
    `/api/readings/history?person_id=${encodeURIComponent(personId)}&hours=${hours}`
  );
}

export function getSubscribers(personId: string): Promise<Subscriber[]> {
  return apiFetch<Subscriber[]>(`/api/subscribers?person_id=${encodeURIComponent(personId)}`);
}

export function addSubscriber(personId: string, phoneNumber: string, label: string): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, phone_number: phoneNumber, label }),
  });
}

export function removeSubscriber(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/subscribers/${id}`, { method: "DELETE" });
}

export function updateThresholds(
  personId: string,
  low: number,
  high: number,
  staleMinutes: number
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/api/settings/thresholds", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, low, high, stale_minutes: staleMinutes }),
  });
}
