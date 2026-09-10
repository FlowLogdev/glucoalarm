-- Multi-tenant SaaS layer. Additive only -- no existing column value for
-- Felipe's account (person id 'son') is changed by this migration, only new
-- nullable/backfilled columns are added.

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'active',
  stripe_checkout_session_id TEXT UNIQUE
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT,
  customer_id TEXT,
  action TEXT NOT NULL,
  target_person_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_log_customer_time ON audit_log (customer_id, created_at DESC);

ALTER TABLE admins ADD COLUMN customer_id TEXT;
ALTER TABLE people ADD COLUMN customer_id TEXT;
ALTER TABLE people ADD COLUMN ticker_interval_minutes INTEGER NOT NULL DEFAULT 20;

-- Backfill: Felipe's existing account becomes customer #1, internal/free.
INSERT INTO customers (id, display_name, created_at, subscription_status)
VALUES ('felipe-internal', 'Felipe (Internal)', strftime('%s', 'now'), 'active');

UPDATE people SET customer_id = 'felipe-internal', ticker_interval_minutes = 20 WHERE id = 'son';

UPDATE admins SET customer_id = 'felipe-internal', is_super_admin = 1
WHERE email IN ('support@flowlog.dev', 'andreapastori2012@gmail.com');
