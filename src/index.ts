import { pollAll } from "./poll";
import { handleApi } from "./api";
import { handleCallAck } from "./calls-webhook";
import { handleStripeWebhook } from "./stripe-webhook";
import { handleRevenueCatWebhook } from "./revenuecat-webhook";
import { checkAndGenerateReports } from "./reports-generator";
import { clientIp, handleWatchdog, logAudit, logError, pruneErrorLog, pruneOpsLogs } from "./ops";
import { handleTwilioStatus } from "./twilio-status";
import { handleGoogleAuthStart, handleGoogleAuthCallback } from "./google-auth";
import { handleWhatsAppInbound } from "./query-bot";
import { handleVoiceInbound } from "./voice-bot";
import { bearerToken, getSessionAdmin } from "./auth";
import type { Env } from "./types";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Two independent cron entries (see wrangler.toml) -- the report-
    // generation check never runs on the same tick as Dexcom polling.
    if (event.cron === "0 4 * * *") {
      ctx.waitUntil(checkAndGenerateReports(env, Math.floor(Date.now() / 1000)));
      ctx.waitUntil(pruneErrorLog(env, Math.floor(Date.now() / 1000)));
      ctx.waitUntil(pruneOpsLogs(env, Math.floor(Date.now() / 1000)));
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
      const res = await handleStripeWebhook(request.clone(), env, Math.floor(Date.now() / 1000));
      await auditWebhook(env, "stripe", request, res);
      return res;
    }

    if (request.method === "POST" && url0.pathname === "/api/revenuecat/webhook") {
      const res = await handleRevenueCatWebhook(request.clone(), env);
      await auditWebhook(env, "revenuecat", request, res);
      return res;
    }

    // Twilio delivery status for every outbound message/call -- same
    // reasoning: public, verified by Twilio's own request signature.
    if (request.method === "POST" && url0.pathname === "/api/twilio/status") {
      return handleTwilioStatus(request, env);
    }

    // External watchdog (GitHub Actions) -- authenticated by WATCHDOG_KEY,
    // not a session, since it runs outside any login.
    if (request.method === "GET" && url0.pathname === "/api/ops/watchdog") {
      return handleWatchdog(request, env, () => pollAll(env));
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

    // Voice inbound -- same reasoning: public, verified by Twilio's own
    // request signature instead of our bearer token.
    if (request.method === "POST" && url0.pathname === "/api/voice/inbound") {
      return handleVoiceInbound(request, env, Math.floor(Date.now() / 1000));
    }

    let apiResponse: Response | null;
    try {
      apiResponse = await handleApi(request, env, Math.floor(Date.now() / 1000));
    } catch (err) {
      console.error(`handleApi threw for ${request.method} ${url0.pathname}:`, err);
      await logError(env, "api", null, `${request.method} ${url0.pathname}: ${err instanceof Error ? err.message : String(err)}`);
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
    if (apiResponse) {
      if (apiResponse.status >= 500) {
        await logError(env, "api", null, `${request.method} ${url0.pathname} returned ${apiResponse.status}: ${(await apiResponse.clone().text()).slice(0, 500)}`);
      }
      return apiResponse;
    }

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

/** Billing webhooks change subscription state -- keep a trail of each one. */
async function auditWebhook(env: Env, provider: "stripe" | "revenuecat", request: Request, res: Response): Promise<void> {
  let type = "unknown";
  try {
    const body = (await request.json()) as { type?: string; event?: { type?: string } };
    type = body.type ?? body.event?.type ?? "unknown";
  } catch {
    // unparseable body -- the handler already rejected it
  }
  await logAudit(env, { action: `webhook:${provider}`, detail: `${type} -> HTTP ${res.status}`, ip: clientIp(request) });
  if (res.status >= 400) await logError(env, "webhook", null, `${provider} webhook ${type} returned HTTP ${res.status}`);
}
