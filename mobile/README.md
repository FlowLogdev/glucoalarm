# GlucoAlarm mobile

One Expo app for iOS and Android. It authenticates against the existing
Cloudflare Worker, stores only the Worker session token in the platform secure
keychain/keystore, and reads the same account/data that is shown on the web.

## Billing model

- **Web:** existing Stripe checkout remains unchanged.
- **iOS / Android:** RevenueCat manages the native $59.99/month purchase.
- **Shared access:** after login, the app uses the existing `customers.id` as
  the RevenueCat `appUserID`. A customer therefore has one identity across
  glucoalarm.com, App Store, and Google Play.
- The Worker records Stripe and RevenueCat states separately and only pauses
  monitoring when neither source is active.

## RevenueCat setup required before a real build

1. In RevenueCat, create iOS app `com.flowlogdev.glucoalarm` and Android app
   `com.flowlogdev.glucoalarm`.
2. Create matching App Store Connect and Google Play auto-renewing monthly
   products at **$59.99 USD**. Use one stable product ID on both stores, for
   example `com.flowlogdev.glucoalarm.pro.monthly`.
3. Attach both products to one RevenueCat entitlement named
   `glucoalarm_pro`, then add them to the current offering.
4. Copy RevenueCat's **public SDK keys** into `.env` using `.env.example`.
5. Create a RevenueCat webhook for
   `https://watchgluco-worker.sales-ff4.workers.dev/api/revenuecat/webhook`.
   Set a long random Authorization value in the RevenueCat dashboard and set
   that exact value as the Worker secret:

   ```sh
   npx wrangler secret put REVENUECAT_WEBHOOK_AUTHORIZATION
   ```

6. Apply the Worker migration and deploy the Worker before testing a native
   purchase:

   ```sh
   npm run db:migrate:remote
   npm run deploy
   ```

## Development and releases

Real RevenueCat purchases require a development build; Expo Go can only
preview the interface. After filling `.env`:

```sh
npx expo install --fix
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android
```

Use the `preview` EAS profile for TestFlight/internal Play testing and the
`production` profile only after store products and webhook delivery have been
verified.

No Supabase connection is used by this project. The live product's backend is
the existing Cloudflare Worker + D1 database; Vercel continues to host the web
application.
