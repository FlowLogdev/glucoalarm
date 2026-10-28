-- Caregiver-entered historical records only; no dose calculations or recommendations use these fields.
ALTER TABLE insulin_log ADD COLUMN insulin_type TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE insulin_log ADD COLUMN glucose_recorded_at INTEGER;
ALTER TABLE insulin_log ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
CREATE INDEX idx_insulin_log_person_day ON insulin_log (person_id, logged_at DESC);
