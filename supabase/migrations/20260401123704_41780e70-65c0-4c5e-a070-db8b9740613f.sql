ALTER TABLE public.ticket_ai_resolutions 
  ADD COLUMN IF NOT EXISTS implementation_report jsonb,
  ADD COLUMN IF NOT EXISTS implemented_at timestamptz,
  ADD COLUMN IF NOT EXISTS implementation_status text;