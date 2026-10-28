-- More operator logs for the /admin console.
-- message_log: every outbound WhatsApp/SMS/voice send, updated by Twilio
-- status callbacks so "Twilio accepted it but the phone never got it" is
-- visible. cron_runs: one row per poller run (health history + watchdog).
-- audit_log (from 0013, previously unused) gains detail/ip so logins,
-- signups, billing webhooks and admin actions can be recorded.
CREATE TABLE message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  channel TEXT NOT NULL,
  to_number TEXT NOT NULL,
  kind TEXT,
  twilio_sid TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX idx_message_log_time ON message_log (created_at DESC);
CREATE UNIQUE INDEX idx_message_log_sid ON message_log (twilio_sid) WHERE twilio_sid IS NOT NULL;

CREATE TABLE cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  people_polled INTEGER NOT NULL,
  errors INTEGER NOT NULL
);
CREATE INDEX idx_cron_runs_time ON cron_runs (started_at DESC);

ALTER TABLE audit_log ADD COLUMN detail TEXT;
ALTER TABLE audit_log ADD COLUMN ip TEXT;
CREATE INDEX idx_audit_log_time ON audit_log (created_at DESC);
