
CREATE TABLE public.ai_resolution_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID,
  used_rule BOOLEAN DEFAULT false,
  used_cache BOOLEAN DEFAULT false,
  used_code_context BOOLEAN DEFAULT false,
  code_context_length INTEGER DEFAULT 0,
  ai_called BOOLEAN DEFAULT false,
  response_time_ms INTEGER,
  confidence_score DOUBLE PRECISION,
  resolution_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_resolution_metrics_ticket_id ON public.ai_resolution_metrics(ticket_id);
CREATE INDEX idx_ai_resolution_metrics_created_at ON public.ai_resolution_metrics(created_at);

ALTER TABLE public.ai_resolution_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and HR can view metrics"
ON public.ai_resolution_metrics FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
);

CREATE POLICY "Service role can insert metrics"
ON public.ai_resolution_metrics FOR INSERT
TO authenticated
WITH CHECK (true);
