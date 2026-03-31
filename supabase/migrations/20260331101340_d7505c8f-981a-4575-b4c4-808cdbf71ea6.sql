
ALTER TABLE public.email_leads
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_processed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS ai_confidence real,
  ADD COLUMN IF NOT EXISTS ai_extracted_json jsonb;
