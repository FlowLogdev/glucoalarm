# WatchGluco — Cloudflare Worker (Session 1: backend skeleton)

Cron-driven glucose polling + alert pipeline, per `watchgluco-build-spec.md`.
Currently uses `MockDexcomClient` (random-walk readings) so the full
pipeline — poll → store in D1 → threshold/staleness/cooldown logic → "send"
SMS — is testable before real Dexcom credentials are wired in (Session 2)
and real Twilio sending is wired in (Session 3).

## Local dev

```
npm install
npm run db:migrate:local        # applies migrations/0001_init.sql, seeds dad/son
npm run dev                     # wrangler dev on :8787
curl http://localhost:8787/__poll   # manually trigger one poll cycle
                                     # (Miniflare doesn't auto-fire cron locally)
```

Inspect local D1 state:
```
npx wrangler d1 execute watchgluco-db --local --command "SELECT * FROM readings ORDER BY id DESC LIMIT 10;"
npx wrangler d1 execute watchgluco-db --local --command "SELECT * FROM alerts_log ORDER BY id DESC LIMIT 10;"
```

To see alerts fire, lower a threshold so the random walk crosses it, e.g.:
```
npx wrangler d1 execute watchgluco-db --local --command "UPDATE people SET high_threshold = 120 WHERE id = 'dad';"
```

## Deploying (not done yet)

1. `npx wrangler d1 create watchgluco-db` and paste the returned `database_id`
   into `wrangler.toml` (currently `REPLACE_WITH_D1_DATABASE_ID`)
2. `npm run db:migrate:remote`
3. `npm run deploy`

## What's next (per the build spec)

- **Session 2:** replace `MockDexcomClient` with a real Dexcom Share API
  client behind the same `DexcomClient` interface (`src/lib/dexcom-client.ts`)
- **Session 3:** replace the `sendSMS` stub in `src/lib/sms.ts` with real
  Twilio calls, add `TWILIO_SID`/`TWILIO_AUTH`/`TWILIO_PHONE` via
  `wrangler secret put`
- **Session 4:** Next.js dashboard reading from this D1 database
- **Session 5:** auth + deploy to watchgluco.com
- **Session 6:** mobile app (Expo)
