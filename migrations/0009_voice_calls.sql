-- Phone calls for low-glucose alerts, on their own cooldown separate from
-- WhatsApp's (see src/index.ts / src/lib/voice.ts). Only subscribers
-- explicitly flagged call_on_low get called -- the patient's own number
-- stays WhatsApp-only by default.
ALTER TABLE phone_subscribers ADD COLUMN call_on_low INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN last_low_call_at INTEGER;
