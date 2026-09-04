-- Carb/insulin log. Arithmetic-only: carb_ratio / correction_factor /
-- target_glucose are entered by the user (as prescribed by their doctor),
-- never inferred by AI. See src/api.ts computeDoseSuggestion and the
-- safety note on the marketing page.
ALTER TABLE people ADD COLUMN carb_ratio REAL;        -- grams of carbs covered by 1 unit of insulin
ALTER TABLE people ADD COLUMN correction_factor REAL; -- mg/dL drop per 1 unit of insulin
ALTER TABLE people ADD COLUMN target_glucose INTEGER; -- mg/dL target used in the correction formula

CREATE TABLE insulin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  logged_at INTEGER NOT NULL,
  carbs_grams REAL,
  food_description TEXT,
  glucose_at_dose INTEGER,
  dose_units REAL,
  note TEXT
);

CREATE INDEX idx_insulin_log_person_time ON insulin_log (person_id, logged_at DESC);
