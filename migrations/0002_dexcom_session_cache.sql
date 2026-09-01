-- Session 2: cache the Dexcom Share session per person so the Worker doesn't
-- re-authenticate every cron run (sessions last ~24h).
ALTER TABLE people ADD COLUMN dexcom_session_id TEXT;
ALTER TABLE people ADD COLUMN dexcom_session_expires_at INTEGER;
