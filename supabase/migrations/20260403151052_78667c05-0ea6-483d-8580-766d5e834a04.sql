
-- Create statement_uploads table
CREATE TABLE public.statement_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  card_id UUID REFERENCES public.credit_cards(id),
  uploaded_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  ai_confidence_score NUMERIC,
  parsed_json JSONB,
  error_message TEXT,
  statement_id UUID REFERENCES public.cc_monthly_statements(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.statement_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and finance can view uploads"
ON public.statement_uploads FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')
);

CREATE POLICY "Admin and finance can insert uploads"
ON public.statement_uploads FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  AND uploaded_by = auth.uid()
);

CREATE POLICY "Admin and finance can update uploads"
ON public.statement_uploads FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')
);

-- Create private storage bucket for cc statements
INSERT INTO storage.buckets (id, name, public) VALUES ('cc-statements', 'cc-statements', false);

CREATE POLICY "Admin/Finance can upload cc statements"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cc-statements'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
);

CREATE POLICY "Admin/Finance can read cc statements"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cc-statements'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
);
