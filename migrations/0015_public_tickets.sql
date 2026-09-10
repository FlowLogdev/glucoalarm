ALTER TABLE support_tickets ADD COLUMN ticket_number TEXT;
ALTER TABLE support_tickets ADD COLUMN first_name TEXT;
ALTER TABLE support_tickets ADD COLUMN last_name TEXT;
ALTER TABLE support_tickets ADD COLUMN email TEXT;
ALTER TABLE support_tickets ADD COLUMN phone TEXT;

CREATE UNIQUE INDEX idx_support_tickets_ticket_number ON support_tickets (ticket_number);

-- Guest/public tickets use customer_id='guest', admin_id='guest' rather than
-- a table rebuild to make those columns nullable -- avoids any risk to the
-- existing authenticated-ticket rows and keeps the ownership-guard logic
-- unchanged (guest tickets are visible only to super-admins, same as any
-- ticket with no matching customer_id).
CREATE TABLE ticket_sequence (
  year INTEGER PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 10000
);
