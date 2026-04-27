-- Create leads table for WordPress form submissions
CREATE TABLE IF NOT EXISTS public.leads (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  form_type     TEXT,
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  company       TEXT,
  subject       TEXT,
  message       TEXT,
  location      TEXT,
  role          TEXT,
  urgency       TEXT,
  sector        TEXT,
  page_url      TEXT,
  ip            TEXT,
  user_agent    TEXT,
  submitted_at  TEXT,
  payload       JSONB,
  destinations  JSONB,
  status        TEXT NOT NULL DEFAULT 'new'
);

-- Indexes for filters
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_form_type  ON public.leads (form_type);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_email      ON public.leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_phone      ON public.leads (phone);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow Admin / Sales / Sales Manager to read
CREATE POLICY "leads_select_sales_admin"
ON public.leads FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales'::app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Allow Admin / Sales / Sales Manager to update (status changes)
CREATE POLICY "leads_update_sales_admin"
ON public.leads FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales'::app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales'::app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Allow Admin to delete
CREATE POLICY "leads_delete_admin"
ON public.leads FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
