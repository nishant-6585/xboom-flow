
CREATE TABLE public.ai_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_role text NOT NULL,
  query_text text NOT NULL,
  tool_name text NOT NULL,
  access_type text NOT NULL DEFAULT 'full',
  masked_fields text[] DEFAULT '{}',
  denied_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all access logs"
ON public.ai_access_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert access logs"
ON public.ai_access_logs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_ai_access_logs_user ON public.ai_access_logs(user_id);
CREATE INDEX idx_ai_access_logs_created ON public.ai_access_logs(created_at DESC);
