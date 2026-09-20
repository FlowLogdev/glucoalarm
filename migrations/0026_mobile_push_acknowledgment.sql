-- Native-device push registration and one active, acknowledgement-tracked
-- falling-glucose episode per monitored person. Tokens belong to app admins,
-- never to a patient or to a phone-subscriber record.
CREATE TABLE mobile_push_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_mobile_push_devices_admin ON mobile_push_devices(admin_id);

CREATE TABLE mobile_alert_episodes (
  person_id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_value_mgdl INTEGER NOT NULL,
  last_trend TEXT NOT NULL,
  last_reading_at INTEGER NOT NULL,
  last_notified_at INTEGER,
  acknowledged_at INTEGER,
  acknowledged_by_admin_id TEXT,
  resolved_at INTEGER
);
