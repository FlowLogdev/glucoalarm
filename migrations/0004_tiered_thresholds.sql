-- Replaces the single low/high threshold with a symmetric 5-tier model:
-- critical_low < warn (implicit) < safe_low..safe_high < warn (implicit) < critical_high
-- safe range: no alerts. warn tiers: WhatsApp every 5 min. critical tiers:
-- WhatsApp every 1 min, marked CRITICAL. See src/lib/alerts.ts.
ALTER TABLE people ADD COLUMN safe_low INTEGER NOT NULL DEFAULT 105;
ALTER TABLE people ADD COLUMN safe_high INTEGER NOT NULL DEFAULT 200;
ALTER TABLE people ADD COLUMN critical_low INTEGER NOT NULL DEFAULT 70;
ALTER TABLE people ADD COLUMN critical_high INTEGER NOT NULL DEFAULT 250;

UPDATE people SET safe_low = 105, safe_high = 200, critical_low = 70, critical_high = 250;

ALTER TABLE people DROP COLUMN low_threshold;
ALTER TABLE people DROP COLUMN high_threshold;
