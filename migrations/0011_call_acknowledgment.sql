-- Low-glucose call escalation state, per person, reset whenever the tier
-- returns to safe (see src/index.ts pollPerson).
ALTER TABLE people ADD COLUMN low_call_acknowledged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN low_call_critical_escalated INTEGER NOT NULL DEFAULT 0;
