export interface Env {
  DB: D1Database;
  DEXCOM_MODE: string; // "mock" | "dexcom"
  DEXCOM_BASE_URL: string;
  DEXCOM_APPLICATION_ID: string;
  DEXCOM_ENC_KEY: string; // base64 32-byte AES-GCM key, set via `wrangler secret put`
  MESSAGE_MODE: string; // "log" | "whatsapp"
  TWILIO_SID: string; // set via `wrangler secret put`
  TWILIO_AUTH: string; // set via `wrangler secret put`
  TWILIO_WHATSAPP_FROM: string; // set via `wrangler secret put`, E.164 e.g. +14155238886
  ANTHROPIC_API_KEY: string; // set via `wrangler secret put`
  ANTHROPIC_MODEL: string; // e.g. "claude-haiku-4-5-20251001"
}
