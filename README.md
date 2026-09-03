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
- **Session 3** (superseded by Session 5): originally SMS, now WhatsApp.
- **Session 4** (done): Next.js dashboard in `web/` — `/dashboard` (both
  people, status colors, trend arrows, polls every 30s), `/history/[personId]`
  (recharts line chart, 3h/24h/7d toggle), `/settings` (thresholds + phone
  subscriber management). It talks to the Worker's `/api/*` routes
  (`src/api.ts`) rather than touching D1 directly — Cloudflare credentials
  never need to exist on Vercel.
- **Session 5** (done): admin login, WhatsApp messaging (replacing SMS), a
  5-tier alert engine (safe / warn / critical, both directions), and a
  public marketing page at `/`. Details below.

## Session 5: auth, tiered alerts, WhatsApp

**Alert tiers** (`src/lib/alerts.ts`) replaced the old single low/high
threshold. Each person now has four numbers: `critical_low < safe_low <
safe_high < critical_high`. Defaults: 70 / 105 / 200 / 250.

| Range | Behavior |
|---|---|
| `safe_low`–`safe_high` | silent |
| `safe_low`/`safe_high` to `critical_low`/`critical_high` | WhatsApp every 5 min |
| beyond `critical_low`/`critical_high` | WhatsApp every 1 min, marked CRITICAL |
| re-entering the safe range from any non-safe tier | one "back in range" message, then silent again |

**Messaging** moved from SMS to WhatsApp (`src/lib/whatsapp.ts`), via
Twilio's WhatsApp API. Gated by `MESSAGE_MODE` (`"log"` vs `"whatsapp"`),
same opt-in-only pattern as before.

**Auth**: the Worker has its own `admins` table (PBKDF2-hashed passwords,
`src/lib/password.ts` / `src/auth.ts`) and session-based login
(`POST /api/auth/login` → bearer token, all other `/api/*` routes require
`Authorization: Bearer <token>`). The dashboard never talks to the Worker
directly or holds the token in browser-readable storage — see "How auth
works" below.

A super admin (`support@flowlog.dev`) was seeded via migration
`0003_admins.sql`. **The password was typed in chat to set this up, so it's
in this conversation's history — worth rotating.** To set a new password
without ever typing it anywhere but this one command:
```
node scripts/hash-password.mjs "new-password"
npx wrangler d1 execute watchgluco-db --local --command \
  "UPDATE admins SET password_hash = '<hash from above>' WHERE email = 'support@flowlog.dev';"
```
(add `--remote` for the deployed database.)

### How auth works end to end

```
Browser --(same-origin, httpOnly cookie)--> Next.js route handlers --(Bearer token)--> Worker
```

- `POST /api/login` (Next.js) calls the Worker's login, then sets an
  httpOnly, Secure, SameSite=Lax cookie (`session_id`) on the Next.js
  domain. The browser never sees the raw bearer token.
- `app/api/proxy/[...path]/route.ts` forwards every dashboard data call to
  the Worker with `Authorization: Bearer <session_id from cookie>`. The
  client-side code (`web/app/lib/api.ts`) only ever calls same-origin
  `/api/proxy/*` — no CORS, no token in browser JS.
- `middleware.ts` redirects unauthenticated visitors away from
  `/dashboard`, `/history/*`, `/settings` to `/login`. This is a fast
  presence-only check; the proxy route (and the Worker) independently
  re-validate the session on every data call, so an expired/invalidated
  session still gets rejected even if the redirect check is bypassed.
- `POST /api/logout` clears the cookie and deletes the session server-side.

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

To see alerts fire, tighten the safe range so the random walk crosses it, e.g.:
```
npx wrangler d1 execute watchgluco-db --local --command "UPDATE people SET safe_low = 120, safe_high = 130 WHERE id = 'dad';"
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

## Turning on real WhatsApp sending

WhatsApp requires the recipient to opt in first, unlike SMS.

1. **Twilio WhatsApp Sandbox (for testing):** in the Twilio Console under
   Messaging → Try it out → WhatsApp, you'll see a sandbox number (usually
   `+14155238886`) and a join code like `join happy-tiger`. Each recipient
   phone sends that join message to that number on WhatsApp once — this
   opts them in for 72 hours (rejoin as needed while testing). For
   production, you'd apply for a real WhatsApp Business sender instead
   (longer process, not needed to get this working today).

2. Add at least one row to `phone_subscribers` per person:
   ```
   npx wrangler d1 execute watchgluco-db --local --command \
     "INSERT INTO phone_subscribers (person_id, phone_number, label) VALUES ('dad', '+13055551234', 'my phone');"
   ```
   Phone numbers must be E.164 format (`+1` + 10 digits for US numbers).

3. Set the Twilio secrets — run these yourself, the prompt keeps the
   values off the terminal history and out of this chat:
   ```
   npx wrangler secret put TWILIO_SID --local              # starts with AC...
   npx wrangler secret put TWILIO_AUTH --local              # Auth Token
   npx wrangler secret put TWILIO_WHATSAPP_FROM --local      # sandbox number while testing, e.g. +14155238886
   ```
   Repeat without `--local` once you're ready to set them on the deployed
   Worker.

4. Flip `MESSAGE_MODE = "whatsapp"` in `wrangler.toml` (or override locally
   with `wrangler dev --var MESSAGE_MODE:whatsapp` without editing the
   file).

5. Trigger a real alert to confirm delivery — temporarily tighten the safe
   range below the current reading, poll, then put it back:
   ```
   npx wrangler d1 execute watchgluco-db --local --command "UPDATE people SET safe_low = 500, safe_high = 600 WHERE id = 'dad';"
   curl http://localhost:8787/__poll
   npx wrangler d1 execute watchgluco-db --local --command "UPDATE people SET safe_low = 105, safe_high = 200 WHERE id = 'dad';"
   ```

## Local dev — dashboard (`web/`)

```
cd web
npm install
cp .env.local.example .env.local   # API_BASE_URL=http://localhost:8787 (server-only, not exposed to the browser)
npm run dev                        # next dev — uses :3000, or `-- -p <port>` if that's taken
```

Run the Worker (`npm run dev` from the repo root) alongside it. Pages:
- `/` — public marketing page, no auth
- `/login` — admin login
- `/dashboard`, `/history/[personId]`, `/settings` — behind auth
  (`middleware.ts` redirects to `/login` if there's no session cookie)

`MockDexcomClient` readings will show up on the dashboard exactly like real
ones would.

**Not yet visually verified in a real browser** — pages compile, the full
login → cookie → proxy → Worker chain was curl-tested end to end (including
that logout actually invalidates the session server-side), but no
screenshot/click-through pass has been done. Worth a manual look, especially
at the marketing page's layout, before calling this fully done.

## Deploying

**Worker:**
1. `npx wrangler d1 create watchgluco-db` and paste the returned `database_id`
   into `wrangler.toml` (currently `REPLACE_WITH_D1_DATABASE_ID`)
2. `npm run db:migrate:remote`
3. `npx wrangler secret put DEXCOM_ENC_KEY`, `TWILIO_SID`, `TWILIO_AUTH`,
   `TWILIO_WHATSAPP_FROM` (see above, all without `--local`)
4. `npm run deploy`

**Dashboard:** deploy `web/` to Vercel as its own project (root directory
`web`), set `API_BASE_URL` (server-only — do **not** prefix it
`NEXT_PUBLIC_`, or the Worker's URL and the session flow both leak to the
browser) to the deployed Worker's URL in Vercel's project env vars, then
point watchgluco.com's DNS at Vercel.

## What's next (per the build spec)

- **Session 6:** mobile app (Expo)
- Carb + insulin dosing log (arithmetic only, no AI-generated dosing — see
  the safety note on the marketing page)
- AI-generated time-of-day pattern insights and weekly/bi-weekly/monthly
  reports
