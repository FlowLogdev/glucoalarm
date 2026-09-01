import type { DexcomClient, Reading } from "./dexcom-client";

// Public application ID used by the Dexcom Share mobile app's follower API.
// Well-known/reverse-engineered (same constant used by Nightscout's
// share2nightscout-bridge and xDrip); not a secret.
export const DEFAULT_APPLICATION_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";

const TREND_MAP: Record<string, string> = {
  DoubleUp: "rising_fast",
  SingleUp: "rising",
  FortyFiveUp: "rising",
  Flat: "flat",
  FortyFiveDown: "falling",
  SingleDown: "falling",
  DoubleDown: "falling_fast",
  NotComputable: "flat",
  RateOutOfRange: "flat",
  None: "flat",
};

/** Thrown when Dexcom rejects the session — caller should re-authenticate and retry once. */
export class DexcomSessionError extends Error {}

/** Thrown for any other Dexcom API failure (bad credentials, network, unexpected shape). */
export class DexcomApiError extends Error {}

const SESSION_ERROR_CODES = new Set([
  "SessionNotValid",
  "SessionIdNotFound",
  "SSO_AuthenticateMaxSessionsError",
]);

function parseDexcomDate(wt: string): number {
  // Dexcom returns WCF-style dates: "/Date(1690000000000)/"
  const match = /Date\((\d+)\)/.exec(wt);
  if (!match) throw new DexcomApiError(`Unrecognized Dexcom date format: ${wt}`);
  return Math.floor(Number(match[1]) / 1000);
}

export class DexcomShareClient implements DexcomClient {
  constructor(
    private baseUrl: string,
    private applicationId: string = DEFAULT_APPLICATION_ID
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/ShareWebServices/Services${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const code =
        typeof parsed === "object" && parsed !== null && "Code" in parsed
          ? String((parsed as { Code: unknown }).Code)
          : null;
      if (code && SESSION_ERROR_CODES.has(code)) {
        throw new DexcomSessionError(code);
      }
      throw new DexcomApiError(`Dexcom API error (${res.status}): ${text}`);
    }

    return parsed as T;
  }

  async authenticate(username: string, password: string): Promise<{ sessionId: string }> {
    const accountId = await this.post<string>("/General/AuthenticatePublisherAccount", {
      accountName: username,
      password,
      applicationId: this.applicationId,
    });

    if (!accountId || accountId === "00000000-0000-0000-0000-000000000000") {
      throw new DexcomApiError("Dexcom authentication failed: invalid credentials");
    }

    const sessionId = await this.post<string>("/General/LoginPublisherAccountById", {
      accountId,
      password,
      applicationId: this.applicationId,
    });

    if (!sessionId || sessionId === "00000000-0000-0000-0000-000000000000") {
      throw new DexcomApiError("Dexcom login failed: invalid session returned");
    }

    return { sessionId };
  }

  async getLatestReadings(sessionId: string, sinceMinutes: number): Promise<Reading[]> {
    const minutes = Math.max(1, Math.min(1440, Math.ceil(sinceMinutes)));
    const raw = await this.post<
      Array<{ WT: string; ST: string; DT: string; Value: number; Trend: string }>
    >(
      `/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${encodeURIComponent(
        sessionId
      )}&minutes=${minutes}&maxCount=288`,
      {}
    );

    if (!Array.isArray(raw)) {
      throw new DexcomApiError(`Unexpected Dexcom response shape: ${JSON.stringify(raw)}`);
    }

    return raw
      .map((r) => ({
        value: r.Value,
        trend: TREND_MAP[r.Trend] ?? "flat",
        timestamp: parseDexcomDate(r.WT),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}
