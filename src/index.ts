import { MockDexcomClient } from "./lib/dexcom-client-mock";
import { classifyReading, isStale, isInCooldown, type AlertType, type Person } from "./lib/alerts";
import { sendSMS, messageFor, type Env } from "./lib/sms";

async function pollPerson(person: Person, env: Env, now: number): Promise<void> {
  const lastReading = await env.DB
    .prepare(
      `SELECT value_mgdl, received_at FROM readings WHERE person_id = ? ORDER BY recorded_at DESC LIMIT 1`
    )
    .bind(person.id)
    .first<{ value_mgdl: number; received_at: number }>();

  const client = new MockDexcomClient();
  const reading = client.nextReading(lastReading?.value_mgdl ?? null);

  await env.DB
    .prepare(
      `INSERT INTO readings (person_id, value_mgdl, trend, recorded_at, received_at) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(person.id, reading.value, reading.trend, reading.timestamp, now)
    .run();

  const lastAlert = await env.DB
    .prepare(
      `SELECT type, sent_at FROM alerts_log WHERE person_id = ? ORDER BY sent_at DESC LIMIT 1`
    )
    .bind(person.id)
    .first<{ type: AlertType; sent_at: number }>();

  let alertType: AlertType | null = null;

  if (lastReading && isStale(now, lastReading.received_at, person.stale_minutes)) {
    alertType = "signal_lost";
  } else {
    alertType = classifyReading(person, reading.value, lastAlert?.type ?? null);
  }

  if (!alertType) return;

  const lastSameTypeAlert = await env.DB
    .prepare(
      `SELECT sent_at FROM alerts_log WHERE person_id = ? AND type = ? ORDER BY sent_at DESC LIMIT 1`
    )
    .bind(person.id, alertType)
    .first<{ sent_at: number }>();

  if (isInCooldown(now, lastSameTypeAlert?.sent_at ?? null)) return;

  const subscribers = await env.DB
    .prepare(`SELECT phone_number FROM phone_subscribers WHERE person_id = ?`)
    .bind(person.id)
    .all<{ phone_number: string }>();

  const time = new Date(now * 1000).toISOString();
  const body = messageFor(
    alertType,
    person.name,
    reading.value,
    reading.trend,
    person.stale_minutes,
    time
  );

  for (const sub of subscribers.results) {
    await sendSMS(sub.phone_number, body, env);
  }

  await env.DB
    .prepare(
      `INSERT INTO alerts_log (person_id, type, value_mgdl, sent_at) VALUES (?, ?, ?, ?)`
    )
    .bind(person.id, alertType, reading.value, now)
    .run();
}

async function pollAll(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const people = await env.DB.prepare(`SELECT * FROM people`).all<Person>();
  for (const person of people.results) {
    await pollPerson(person, env, now);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pollAll(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // Manual trigger for local testing: curl http://localhost:8787/__poll
    const url = new URL(request.url);
    if (url.pathname === "/__poll") {
      await pollAll(env);
      return new Response("polled\n");
    }
    return new Response("watchgluco worker\n");
  },
};
