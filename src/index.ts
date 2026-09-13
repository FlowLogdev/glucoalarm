import { pollAll } from "./poll";
import { handleApi } from "./api";
import { handleCallAck } from "./calls-webhook";
import { handleStripeWebhook } from "./stripe-webhook";
import { checkAndGenerateReports } from "./reports-generator";
import { handleGoogleAuthStart, handleGoogleAuthCallback } from "./google-auth";
import { handleWhatsAppInbound } from "./query-bot";
import { bearerToken, getSessionAdmin } from "./auth";
import type { Env } from "./types";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Two independent cron entries (see wrangler.toml) -- the report-
    // generation check never runs on the same tick as Dexcom polling.
    if (event.cron === "0 4 * * *") {
      ctx.waitUntil(checkAndGenerateReports(env, Math.floor(Date.now() / 1000)));
      return;
    }
    ctx.waitUntil(pollAll(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url0 = new URL(request.url);
    // Twilio webhook -- public by necessity (Twilio can't send our bearer
    // token), secured via its own signature verification instead. Must be
    // checked before handleApi, which would otherwise 401 it as an
    // unauthenticated /api/* request.
    if (request.method === "POST" && url0.pathname === "/api/calls/ack") {
      return handleCallAck(request, env);
    }

    // Stripe webhook -- same reasoning: public, verified by Stripe's own
    // request signature instead of our bearer token.
    if (request.method === "POST" && url0.pathname === "/api/stripe/webhook") {
      return handleStripeWebhook(request, env, Math.floor(Date.now() / 1000));
    }

    // Google OAuth -- public by necessity (Google redirects the browser
    // here directly, no bearer token available), protected by the signed
    // `state` param instead. Same reasoning as the Twilio/Stripe webhooks.
    if (request.method === "GET" && url0.pathname === "/api/auth/google/start") {
      return handleGoogleAuthStart(request, env, Math.floor(Date.now() / 1000));
    }
    if (request.method === "GET" && url0.pathname === "/api/auth/google/callback") {
      return handleGoogleAuthCallback(request, env, Math.floor(Date.now() / 1000));
    }

    // WhatsApp inbound -- same reasoning: public, verified by Twilio's own
    // request signature instead of our bearer token.
    if (request.method === "POST" && url0.pathname === "/api/whatsapp/inbound") {
      return handleWhatsAppInbound(request, env, Math.floor(Date.now() / 1000));
    }

    const apiResponse = await handleApi(request, env, Math.floor(Date.now() / 1000));
    if (apiResponse) return apiResponse;

    // Manual trigger, e.g. for local testing: curl http://localhost:8787/__poll
    // Requires the same admin bearer token as /api/* so it can't be hit
    // anonymously once this is deployed and polling real Dexcom/Twilio.
    const url = new URL(request.url);
    if (url.pathname === "/__poll") {
      const token = bearerToken(request);
      const admin = token ? await getSessionAdmin(env, token, Math.floor(Date.now() / 1000)) : null;
      if (!admin) return new Response("unauthorized\n", { status: 401 });
      await pollAll(env);
      return new Response("polled\n");
    }
    return new Response("watchgluco worker\n");
  },
};
