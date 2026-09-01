# WatchGluco — Cloudflare Worker

Cron-driven glucose polling + alert pipeline, per `watchgluco-build-spec.md`.

- **Session 1** (done): Worker skeleton, D1 schema, `MockDexcomClient`
  (random-walk readings) so the full pipeline — poll → store in D1 →
  threshold/staleness/cooldown logic → "send" SMS — is testable before real
  credentials exist.
- **Session 2** (done): real `DexcomShareClient` (`src/lib/dexcom-client-share.ts`)
  behind the same `DexcomClient` interface, with per-person session caching
  in D1 and `dexcom_password` encrypted at rest (AES-256-GCM). Switch modes
  via the `DEXCOM_MODE` var — Worker code is identical either way.
- **Session 3** (pending): real Twilio sending — `src/lib/sms.ts` currently
  logs instead of sending.

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

## Switching a person to real Dexcom Share data

Never paste real Dexcom passwords into chat/AI tools — everything below
stays on your machine.

1. **Generate an encryption key** (once, shared by both people):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   npx wrangler secret put DEXCOM_ENC_KEY --local   # for local dev
   npx wrangler secret put DEXCOM_ENC_KEY           # for the deployed Worker
   ```
   (Use the *same* key value for both — `wrangler secret put --local` writes
   to `.wrangler/state`, separate from the remote secret store.)

2. **Encrypt each person's real Dexcom Share password locally:**
   ```
   DEXCOM_ENC_KEY=<the base64 key from step 1> \
     node scripts/encrypt-credential.mjs "their-actual-dexcom-password"
   ```
   Copy the printed base64 ciphertext.

3. **Store the real username + encrypted password in D1** (add `--remote`
   once you're targeting the deployed database instead of local):
   ```
   npx wrangler d1 execute watchgluco-db --local --command \
     "UPDATE people SET dexcom_username = 'their-dexcom-share-username', dexcom_password = '<ciphertext from step 2>' WHERE id = 'dad';"
   ```
   Repeat for `son`. Dexcom Share **username**, not email — the same one
   used in the Dexcom mobile app's Share login. Follower access must already
   be enabled for that account in the Dexcom app.

4. **Flip the mode** in `wrangler.toml`: `DEXCOM_MODE = "dexcom"` (or set it
   per-environment). If either person is outside the US, also set
   `DEXCOM_BASE_URL = "https://shareous1.dexcom.com"`.

5. **Test:** `npm run dev`, then `curl http://localhost:8787/__poll` and
   check `readings` in D1 — you should see your actual glucose value, not a
   random walk.

## Deploying

1. `npx wrangler d1 create watchgluco-db` and paste the returned `database_id`
   into `wrangler.toml` (currently `REPLACE_WITH_D1_DATABASE_ID`)
2. `npm run db:migrate:remote`
3. `npx wrangler secret put DEXCOM_ENC_KEY` (see above)
4. `npm run deploy`

## What's next (per the build spec)

- **Session 3:** replace the `sendSMS` stub in `src/lib/sms.ts` with real
  Twilio calls, add `TWILIO_SID`/`TWILIO_AUTH`/`TWILIO_PHONE` via
  `wrangler secret put`
- **Session 4:** Next.js dashboard reading from this D1 database
- **Session 5:** auth + deploy to watchgluco.com
- **Session 6:** mobile app (Expo)
