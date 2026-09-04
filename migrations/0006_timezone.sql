-- IANA timezone per person (e.g. "America/New_York"), used to compute
-- time-of-day pattern insights in the person's actual local time. Nullable:
-- falls back to UTC until auto-detected from the viewing device's browser
-- (see web/app/(app)/reports/page.tsx) or set manually in Settings.
ALTER TABLE people ADD COLUMN timezone TEXT;
