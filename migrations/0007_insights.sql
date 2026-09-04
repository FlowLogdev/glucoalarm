-- Caches the last AI-generated time-of-day pattern summary per person/period
-- so viewing Reports never triggers a paid API call by itself — only the
-- explicit "Generate insight" button does. See src/insights.ts.
CREATE TABLE insights (
  person_id TEXT NOT NULL,
  period TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (person_id, period)
);
