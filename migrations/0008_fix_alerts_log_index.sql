-- The existing idx_alerts_log_person_type_sent leads with `type`, so
-- "WHERE person_id = ? ORDER BY sent_at DESC LIMIT 1" (used every poll to
-- find the last alert of any type) can't use it as a sorted index and
-- instead scans every row for that person -- confirmed via EXPLAIN QUERY
-- PLAN and a live rows_read of ~3000 for a query returning 1 row. At one
-- poll per person per minute this alone burned through the D1 free tier's
-- daily rows_read cap. This index serves that exact query pattern.
CREATE INDEX idx_alerts_log_person_sent ON alerts_log (person_id, sent_at DESC);
