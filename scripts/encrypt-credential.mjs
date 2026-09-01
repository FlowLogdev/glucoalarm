#!/usr/bin/env node
// Encrypts a Dexcom password locally so plaintext never leaves this machine
// or gets typed into chat. Must stay byte-for-byte compatible with
// src/lib/crypto.ts (same AES-256-GCM scheme: base64(iv[12] || ciphertext+tag)).
//
// Usage:
//   DEXCOM_ENC_KEY=<base64 32-byte key> node scripts/encrypt-credential.mjs "the-plaintext-password"
//
// Generate a key first (one time, then `wrangler secret put DEXCOM_ENC_KEY`):
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const keyB64 = process.env.DEXCOM_ENC_KEY;
const plaintext = process.argv[2];

if (!keyB64 || !plaintext) {
  console.error(
    'Usage: DEXCOM_ENC_KEY=<base64 key> node scripts/encrypt-credential.mjs "<plaintext password>"'
  );
  process.exit(1);
}

function base64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function main() {
  const key = await crypto.subtle.importKey("raw", base64ToBytes(keyB64), "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  console.log(bytesToBase64(combined));
}

main();
