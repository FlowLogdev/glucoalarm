ALTER TABLE phone_subscribers ADD COLUMN verified_at INTEGER;
ALTER TABLE phone_subscribers ADD COLUMN verification_code TEXT;
ALTER TABLE phone_subscribers ADD COLUMN verification_code_sent_at INTEGER;

-- Grandfather in every number that already exists today -- added directly
-- by an authenticated account owner, not by a typo just now.
UPDATE phone_subscribers SET verified_at = strftime('%s','now') WHERE verified_at IS NULL;
