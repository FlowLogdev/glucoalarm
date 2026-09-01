import type { DexcomClient, Reading } from "./dexcom-client";

const TRENDS = ["rising_fast", "rising", "flat", "falling", "falling_fast"] as const;

function trendForDelta(delta: number): (typeof TRENDS)[number] {
  if (delta >= 8) return "rising_fast";
  if (delta >= 2) return "rising";
  if (delta <= -8) return "falling_fast";
  if (delta <= -2) return "falling";
  return "flat";
}

/**
 * Session 1 mock: random-walks from `lastValue` so consecutive readings look
 * like a real CGM trace instead of independent noise, and occasionally drifts
 * toward the threshold edges so alert logic gets exercised during testing.
 */
export class MockDexcomClient implements DexcomClient {
  async authenticate(_username: string, _password: string): Promise<{ sessionId: string }> {
    return { sessionId: "mock-session" };
  }

  async getLatestReadings(_sessionId: string, _sinceMinutes: number): Promise<Reading[]> {
    return [];
  }

  /** Extra helper (not part of the DexcomClient interface) used by the Worker
   *  to walk from the previously stored value instead of returning nothing. */
  nextReading(lastValue: number | null): Reading {
    const base = lastValue ?? 100 + Math.floor(Math.random() * 40);
    const delta = Math.floor(Math.random() * 21) - 10; // -10..+10
    const value = Math.max(40, Math.min(300, base + delta));
    return {
      value,
      trend: trendForDelta(delta),
      timestamp: Math.floor(Date.now() / 1000),
    };
  }
}
