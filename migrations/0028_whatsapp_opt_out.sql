-- Default 1 (enabled) so every existing subscriber keeps receiving WhatsApp
-- alerts exactly as before; only call_on_low/call escalation is unaffected
-- by this flag either way.
ALTER TABLE phone_subscribers ADD COLUMN whatsapp_enabled INTEGER NOT NULL DEFAULT 1;
