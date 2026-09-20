-- Human-readable ticket numbers: Gluco-2000-MMDDYYYY, then 2001, 2002,
-- etc. for further tickets created on the same calendar day.
CREATE TABLE support_ticket_daily_sequence (
  date_key TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL
);
