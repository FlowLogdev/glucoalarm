#!/usr/bin/env node
// Hashes an admin password locally (PBKDF2-HMAC-SHA256, 210k iterations).
// Must stay compatible with src/lib/password.ts's verifyPassword.
//
// Usage: node scripts/hash-password.mjs "the-plaintext-password"

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "<plaintext password>"');
  process.exit(1);
}

const ITERATIONS = 210_000;

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function main() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  const hash = new Uint8Array(bits);
  console.log(`pbkdf2$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`);
}

main();
