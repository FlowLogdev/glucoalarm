-- Operator monitoring for the super-admin logs console (/admin).
-- error_log persists failures the poller used to only console.error (which
-- nobody saw -- Workers Observability is off), so an outage like the
-- 2026-10-28 Dexcom 429 can be diagnosed from the web. ops_state holds the
-- cron heartbeat and per-person down/ok state, so the operator's phone gets
-- one alert per transition instead of one per 5-min tick.
CREATE TABLE error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  person_id TEXT,
  message TEXT NOT NULL
);
CREATE INDEX idx_error_log_time ON error_log (created_at DESC);
CREATE INDEX idx_error_log_person_time ON error_log (person_id, created_at DESC);

CREATE TABLE ops_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);
