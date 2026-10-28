-- A one-time code is delivered to the app after Google OAuth. The session
-- token itself is never placed in the custom URL scheme.
CREATE TABLE mobile_auth_grants (
  code TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_mobile_auth_grants_expires_at ON mobile_auth_grants (expires_at);
