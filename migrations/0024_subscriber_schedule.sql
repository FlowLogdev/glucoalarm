-- active_days: comma-separated 0(Sun)-6(Sat), NULL = every day. Both minute
-- fields NULL = always active (today's behavior, so every existing
-- subscriber is unaffected by this migration).
ALTER TABLE phone_subscribers ADD COLUMN active_start_minute INTEGER;
ALTER TABLE phone_subscribers ADD COLUMN active_end_minute INTEGER;
ALTER TABLE phone_subscribers ADD COLUMN active_days TEXT;
