CREATE TABLE glucose_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  report_type TEXT NOT NULL,        -- 'weekly' | 'monthly'
  period_start INTEGER NOT NULL,    -- unix seconds
  period_end INTEGER NOT NULL,
  metrics TEXT NOT NULL,            -- JSON: mean/median/min/max/gmi/tir/tar/tbr/stdev/coverage/event counts
  patterns TEXT,                    -- JSON: time-of-day buckets, spikes/drops, best/worst days, comparison
  ai_analysis TEXT,                 -- JSON: {summary, positive_patterns, patterns_to_watch, discussion_points, questions_for_doctor, disclaimer} or NULL if AI failed
  data_coverage TEXT NOT NULL,      -- JSON: reading_count, days_with_data, coverage_pct
  status TEXT NOT NULL DEFAULT 'complete', -- 'complete' | 'ai_pending'
  generated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_glucose_reports_period ON glucose_reports (person_id, report_type, period_start, period_end);
CREATE INDEX idx_glucose_reports_person_recent ON glucose_reports (person_id, report_type, period_end DESC);

CREATE TABLE a1c_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  a1c_value REAL NOT NULL,
  measured_at INTEGER NOT NULL,
  source TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_a1c_records_person ON a1c_records (person_id, measured_at DESC);
