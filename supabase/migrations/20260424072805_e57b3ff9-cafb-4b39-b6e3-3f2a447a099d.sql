ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID;

CREATE INDEX IF NOT EXISTS idx_call_logs_entity
  ON public.call_logs (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;