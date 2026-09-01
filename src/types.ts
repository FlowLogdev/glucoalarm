export interface Env {
  DB: D1Database;
  DEXCOM_MODE: string; // "mock" | "dexcom"
  DEXCOM_BASE_URL: string;
  DEXCOM_APPLICATION_ID: string;
  DEXCOM_ENC_KEY: string; // base64 32-byte AES-GCM key, set via `wrangler secret put`
}
