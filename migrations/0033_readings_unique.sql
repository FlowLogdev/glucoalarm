-- A manual restart/retry racing the 5-min cron made both runs insert the
-- same Dexcom backlog (81 duplicate rows on 2026-10-28, 139 duplicated
-- timestamps overall), which double-counts readings in reports. Keep the
-- first copy of each (person_id, recorded_at), then make it impossible
-- again; poll.ts inserts with INSERT OR IGNORE.
DELETE FROM readings
WHERE id NOT IN (SELECT MIN(id) FROM readings GROUP BY person_id, recorded_at);

CREATE UNIQUE INDEX idx_readings_person_recorded_unique ON readings (person_id, recorded_at);
