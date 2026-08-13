ALTER TABLE public.form_leads ADD COLUMN IF NOT EXISTS lead_source text;
CREATE INDEX IF NOT EXISTS idx_form_leads_lead_source ON public.form_leads (lead_source);