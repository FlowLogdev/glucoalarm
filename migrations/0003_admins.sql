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
INSERT INTO admins (id, email, password_hash, is_super_admin, created_at)
VALUES (
  'admin-1',
  'support@flowlog.dev',
  'pbkdf2$210000$OE6oEY48sr0Mck/OfrZ/9w==$en90uWvFpuh7DY4ca85oCADCCKn7Kmaqdj33osEHhc4=',
  1,
  strftime('%s', 'now')
);
