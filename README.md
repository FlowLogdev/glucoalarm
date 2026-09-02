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
- **Session 3** (done): real Twilio sending in `src/lib/sms.ts`, gated by
  `SMS_MODE` (`"log"` vs `"twilio"`) so nothing sends for real until you
  opt in. A failed send for one phone number is caught and logged — it
  doesn't block other subscribers or the other monitored person, and the
  alert is still recorded so cooldown logic doesn't resend-storm next cron.
- **Session 4** (done): Next.js dashboard in `web/` — `/` (both people,
  status colors, trend arrows, polls every 30s), `/history/[personId]`
  (recharts line chart, 3h/24h/7d toggle), `/settings` (thresholds + phone
  subscriber management). It talks to the Worker's `/api/*` routes
  (`src/api.ts`) rather than touching D1 directly — Cloudflare credentials
  never need to exist on Vercel. No auth yet (Session 5).

## Local dev — Worker

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

## Turning on real Twilio sending

1. Add at least one row to `phone_subscribers` per person (see the Twilio
   secrets step below first, or you'll get real 401s while testing):
   ```
   npx wrangler d1 execute watchgluco-db --local --command \
     "INSERT INTO phone_subscribers (person_id, phone_number, label) VALUES ('dad', '+13055551234', 'my phone');"
   ```
   Phone numbers must be E.164 format (`+1` + 10 digits for US numbers).

2. Set the three Twilio secrets — run these yourself, the prompt keeps the
   values off the terminal history and out of this chat:
   ```
   npx wrangler secret put TWILIO_SID --local     # starts with AC...
   npx wrangler secret put TWILIO_AUTH --local    # Auth Token
   npx wrangler secret put TWILIO_PHONE --local   # your Twilio number, e.g. +13055550100
   ```
   Repeat without `--local` once you're ready to set them on the deployed
   Worker.

3. Flip `SMS_MODE = "twilio"` in `wrangler.toml` (or override locally with
   `wrangler dev --var SMS_MODE:twilio` without editing the file).

4. Trigger a real alert to confirm delivery — temporarily drop a threshold
   below the current reading, poll, then put it back:
   ```
   npx wrangler d1 execute watchgluco-db --local --command "UPDATE people SET high_threshold = 0 WHERE id = 'dad';"
   curl http://localhost:8787/__poll
   npx wrangler d1 execute watchgluco-db --local --command "UPDATE people SET high_threshold = 180 WHERE id = 'dad';"
   ```

## Local dev — dashboard (`web/`)

```
cd web
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
npm run dev                        # next dev — uses :3000, or `-- -p <port>` if that's taken
```

Run the Worker (`npm run dev` from the repo root) alongside it — the
dashboard is just a client of the Worker's `/api/*` routes, so both need to
be up. `MockDexcomClient` readings will show up on the dashboard exactly
like real ones would.

**Not yet visually verified in a real browser** — pages compile, all
`/api/*` routes were curl-tested directly and return the expected shapes,
and CORS preflight to the Worker succeeds, but no screenshot/click-through
pass has been done. Worth a manual look before calling Session 4 fully done.

## Deploying

**Worker:**
1. `npx wrangler d1 create watchgluco-db` and paste the returned `database_id`
   into `wrangler.toml` (currently `REPLACE_WITH_D1_DATABASE_ID`)
2. `npm run db:migrate:remote`
3. `npx wrangler secret put DEXCOM_ENC_KEY` and the three `TWILIO_*` secrets
   (see above, both without `--local`)
4. `npm run deploy`

**Dashboard (Session 5):** deploy `web/` to Vercel as its own project (root
directory `web`), set `NEXT_PUBLIC_API_BASE_URL` to the deployed Worker's
URL in Vercel's project env vars, then point watchgluco.com's DNS at Vercel.

## What's next (per the build spec)

- **Session 5:** auth + deploy to watchgluco.com
- **Session 6:** mobile app (Expo)
