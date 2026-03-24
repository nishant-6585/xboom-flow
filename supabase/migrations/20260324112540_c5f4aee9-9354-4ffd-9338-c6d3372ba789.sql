CREATE TABLE IF NOT EXISTS public.webhook_debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_method TEXT,
  processing_stage TEXT,
  error_message TEXT
);

ALTER TABLE public.webhook_debug_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'webhook_debug_logs'
      AND policyname = 'Admins can view webhook debug logs'
  ) THEN
    CREATE POLICY "Admins can view webhook debug logs"
    ON public.webhook_debug_logs
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS webhook_debug_logs_created_at_idx
ON public.webhook_debug_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_debug_logs_stage_idx
ON public.webhook_debug_logs (processing_stage);