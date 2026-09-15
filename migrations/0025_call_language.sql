-- Default 'en' means every existing subscriber's calls/IVR sound exactly as
-- they do today until someone explicitly picks a different language.
-- 'pt' means Brazilian Portuguese specifically (Polly.Camila, pt-BR).
ALTER TABLE phone_subscribers ADD COLUMN call_language TEXT NOT NULL DEFAULT 'en'
  CHECK (call_language IN ('en', 'es', 'pt'));
