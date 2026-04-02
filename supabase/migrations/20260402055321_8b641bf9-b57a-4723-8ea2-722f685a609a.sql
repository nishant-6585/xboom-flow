CREATE TABLE public.ai_resolution_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_signature text NOT NULL,
  resolution jsonb NOT NULL,
  ticket_category text,
  source text NOT NULL DEFAULT 'ai',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_resolution_cache_signature ON public.ai_resolution_cache (error_signature);
CREATE INDEX idx_ai_resolution_cache_created ON public.ai_resolution_cache (created_at DESC);

ALTER TABLE public.ai_resolution_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cache"
  ON public.ai_resolution_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert cache"
  ON public.ai_resolution_cache FOR INSERT
  TO service_role
  WITH CHECK (true);