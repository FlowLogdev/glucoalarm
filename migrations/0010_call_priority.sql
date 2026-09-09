-- Call order for low-glucose phone calls: lower number = called first.
-- Subscribers not meant to be called (call_on_low=0) ignore this.
ALTER TABLE phone_subscribers ADD COLUMN call_priority INTEGER NOT NULL DEFAULT 0;
