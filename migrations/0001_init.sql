CREATE TABLE people (
  id TEXT PRIMARY KEY,               -- 'dad', 'son'
  name TEXT NOT NULL,
  dexcom_username TEXT NOT NULL,
  dexcom_password TEXT NOT NULL,     -- encrypted at rest
  low_threshold INTEGER DEFAULT 70,
  high_threshold INTEGER DEFAULT 180,
  stale_minutes INTEGER DEFAULT 20
);

CREATE TABLE readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  value_mgdl INTEGER NOT NULL,
  trend TEXT,                        -- rising_fast | rising | flat | falling | falling_fast
  recorded_at INTEGER NOT NULL,      -- unix ts from Dexcom
  received_at INTEGER NOT NULL       -- unix ts Worker ingested it
);

CREATE TABLE phone_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,           -- whose alerts this number receives
  phone_number TEXT NOT NULL,        -- E.164 format, e.g. +13055551234
  label TEXT
);

CREATE TABLE alerts_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  type TEXT,                         -- high | low | signal_lost | recovered
  value_mgdl INTEGER,
  sent_at INTEGER
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER,
  expires_at INTEGER
);

CREATE INDEX idx_readings_person_recorded ON readings (person_id, recorded_at DESC);
CREATE INDEX idx_alerts_log_person_type_sent ON alerts_log (person_id, type, sent_at DESC);

-- Session 1 seed: two people, mock credentials (unused by the mock Dexcom client).
INSERT INTO people (id, name, dexcom_username, dexcom_password, low_threshold, high_threshold, stale_minutes)
VALUES
  ('dad', 'Dad', 'mock-dad', 'mock-password', 70, 180, 20),
  ('son', 'Son', 'mock-son', 'mock-password', 70, 180, 20);
