import { pollAll } from "./poll";
import { handleApi } from "./api";
import { handleCallAck } from "./calls-webhook";
import { handleStripeWebhook } from "./stripe-webhook";
import { bearerToken, getSessionAdmin } from "./auth";
import type { Env } from "./types";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
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
      return handleStripeWebhook(request, env);
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
