CREATE TABLE bot_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  raw_message TEXT NOT NULL,
  range_days INTEGER NOT NULL,
  metric TEXT NOT NULL,
  responded_at INTEGER NOT NULL
);
CREATE INDEX idx_bot_queries_phone_recent ON bot_queries (phone_number, responded_at DESC);
