ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS requirement text,
  ADD COLUMN IF NOT EXISTS budget text,
  ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS raw_transcript text;

ALTER TABLE public.call_ai_analysis
  ADD COLUMN IF NOT EXISTS extracted_data jsonb;

CREATE INDEX IF NOT EXISTS idx_call_logs_caller_recent
  ON public.call_logs (caller_number, created_at DESC);