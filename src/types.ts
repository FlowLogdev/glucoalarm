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
  WHATSAPP_TEMPLATE_SID: string; // approved Content Template SID, e.g. HX...; business-initiated, no 24h window restriction
  TWILIO_VOICE_FROM: string; // set via `wrangler secret put`, a Voice-capable Twilio number
  ANTHROPIC_API_KEY: string; // set via `wrangler secret put`
  ANTHROPIC_MODEL: string; // e.g. "claude-haiku-4-5-20251001"
  PUBLIC_WORKER_URL: string; // this Worker's own public URL, for Twilio's <Gather> action callback
  PUBLIC_WEB_URL: string; // the Next.js app's public URL, for Stripe Checkout success/cancel redirects
  STRIPE_SECRET_KEY: string; // set via `wrangler secret put`
  STRIPE_WEBHOOK_SECRET: string; // set via `wrangler secret put`, from the Stripe webhook endpoint's signing secret
  STRIPE_PRICE_ID: string; // the flat monthly subscription Price ID, e.g. price_...
  RESEND_API_KEY: string; // set via `wrangler secret put`, from resend.com -- requires the flowlog.dev domain verified as a sender
  GOOGLE_CLIENT_ID: string; // OAuth 2.0 Client ID from Google Cloud Console -- not a secret, sent to the browser as part of the auth redirect
  GOOGLE_CLIENT_SECRET: string; // set via `wrangler secret put`
  GOOGLE_OAUTH_STATE_SECRET: string; // set via `wrangler secret put`, HMAC key for signing OAuth state + pending-signup tokens (any long random string)
}
