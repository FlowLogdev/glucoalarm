#!/usr/bin/env node
// Creates a one-time, static SQL seed for Apple's App Review account.
// It creates no phone recipients and, with migration 0029 applied, its person
// is excluded from all Dexcom polling, WhatsApp, SMS, and voice-call paths.
//
// Usage: node scripts/create-app-review-demo.mjs > /tmp/glucoalarm-review-demo.sql

import { randomBytes, pbkdf2Sync, randomUUID } from "node:crypto";

const now = Math.floor(Date.now() / 1000);
const customerId = "app-review-demo-20260921";
const adminId = randomUUID();
const personId = "app-review-demo-patient";
const email = "appreview@glucoalarm.example";
const password = `GA-Review-${randomBytes(12).toString("base64url")}`;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
const passwordHash = `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`;

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const readings = [];
for (let hour = 7 * 24; hour >= 0; hour--) {
  const cycle = hour % 24;
  const value = 118 + Math.round(32 * Math.sin((cycle / 24) * Math.PI * 2) + (cycle === 8 ? 42 : 0));
  const trend = cycle < 9 ? "rising" : cycle > 18 ? "falling" : "flat";
  const timestamp = now - hour * 3600;
  readings.push(`(${sql(personId)}, ${value}, ${sql(trend)}, ${timestamp}, ${timestamp})`);
}

process.stdout.write(`-- Generated App Review credentials (store securely; do not commit)\n`);
process.stdout.write(`-- Email: ${email}\n`);
process.stdout.write(`-- Password: ${password}\n\n`);
process.stdout.write(`DELETE FROM readings WHERE person_id = ${sql(personId)};\n`);
process.stdout.write(`DELETE FROM auth_sessions WHERE admin_id IN (SELECT id FROM admins WHERE customer_id = ${sql(customerId)});\n`);
process.stdout.write(`DELETE FROM admins WHERE customer_id = ${sql(customerId)};\n`);
process.stdout.write(`DELETE FROM people WHERE customer_id = ${sql(customerId)};\n`);
process.stdout.write(`DELETE FROM customers WHERE id = ${sql(customerId)};\n`);
process.stdout.write(`INSERT INTO customers (id, display_name, created_at, subscription_status, stripe_subscription_status, revenuecat_subscription_status, is_app_review_demo) VALUES (${sql(customerId)}, 'GlucoAlarm App Review Demo', ${now}, 'active', 'active', 'inactive', 1);\n`);
process.stdout.write(`INSERT INTO admins (id, email, password_hash, is_super_admin, customer_id, role, created_at) VALUES (${sql(adminId)}, ${sql(email)}, ${sql(passwordHash)}, 0, ${sql(customerId)}, 'owner', ${now});\n`);
process.stdout.write(`INSERT INTO people (id, name, dexcom_username, dexcom_password, customer_id, safe_low, safe_high, critical_low, critical_high, stale_minutes, ticker_interval_minutes, timezone) VALUES (${sql(personId)}, 'Demo Patient', 'static-review-data', 'not-used', ${sql(customerId)}, 70, 180, 55, 250, 10080, 20, 'America/New_York');\n`);
process.stdout.write(`INSERT INTO readings (person_id, value_mgdl, trend, recorded_at, received_at) VALUES\n${readings.join(",\n")};\n`);
