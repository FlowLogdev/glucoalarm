export interface Env {
  DB: D1Database;
  DEXCOM_MODE: string; // "mock" | "dexcom"
  DEXCOM_BASE_URL: string;
  DEXCOM_APPLICATION_ID: string;
  DEXCOM_ENC_KEY: string; // base64 32-byte AES-GCM key, set via `wrangler secret put`
  SMS_MODE: string; // "log" | "twilio"
  TWILIO_SID: string; // set via `wrangler secret put`
  TWILIO_AUTH: string; // set via `wrangler secret put`
  TWILIO_PHONE: string; // set via `wrangler secret put`, E.164 e.g. +13055551234
}
