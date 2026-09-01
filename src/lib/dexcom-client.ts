export interface Reading {
  value: number;
  trend: string;
  timestamp: number; // unix seconds
}

export interface DexcomClient {
  authenticate(username: string, password: string): Promise<{ sessionId: string }>;
  getLatestReadings(sessionId: string, sinceMinutes: number): Promise<Reading[]>;
}
