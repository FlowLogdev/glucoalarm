-- Dexcom rate-limit backoff gets its own state instead of overloading the
-- session columns, so a 429 no longer throws away a still-valid session.
ALTER TABLE people ADD COLUMN dexcom_backoff_until INTEGER;
ALTER TABLE people ADD COLUMN dexcom_backoff_strikes INTEGER NOT NULL DEFAULT 0;

-- Warn about a silent feed sooner (2026-10-30: 25 min of silence while a low
-- fell to 49). Only rows still on the old default -- not customized values.
UPDATE people SET stale_minutes = 14 WHERE stale_minutes = 20;
