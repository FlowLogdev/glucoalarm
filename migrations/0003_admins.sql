CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,     -- PBKDF2, see src/lib/password.ts
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

ALTER TABLE auth_sessions ADD COLUMN admin_id TEXT;

CREATE INDEX idx_auth_sessions_admin ON auth_sessions (admin_id);

-- Seed the super admin. Password was hashed locally via
-- scripts/hash-password.mjs — plaintext was never written to disk.
-- (100k PBKDF2 iterations, not the 210k this migration originally shipped
-- with: Cloudflare Workers' WebCrypto caps PBKDF2 at 100k and throws
-- NotSupportedError above it on the real edge runtime, even though local
-- wrangler dev/Miniflare silently allows more. See src/lib/password.ts.)
INSERT INTO admins (id, email, password_hash, is_super_admin, created_at)
VALUES (
  'admin-1',
  'support@flowlog.dev',
  'pbkdf2$100000$fQm6uEBK9/g/Fp1N/eQxvg==$W0Uz7yK6xGPJxLuj+zXH921312eUh+0AoLMqvbdafz8=',
  1,
  strftime('%s', 'now')
);
