ALTER TABLE people ADD COLUMN report_email_address TEXT;
ALTER TABLE people ADD COLUMN report_email_weekly INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN report_email_monthly INTEGER NOT NULL DEFAULT 0;
