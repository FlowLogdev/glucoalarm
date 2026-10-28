-- A segregated, static App Review account. These customers remain usable in
-- the app but must never enter the Dexcom polling or alert-delivery paths.
ALTER TABLE customers ADD COLUMN is_app_review_demo INTEGER NOT NULL DEFAULT 0;
