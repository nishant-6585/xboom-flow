
-- Add is_enquiry_converted flag to all lead source tables
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS is_enquiry_converted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.interakt_leads ADD COLUMN IF NOT EXISTS is_enquiry_converted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.form_leads ADD COLUMN IF NOT EXISTS is_enquiry_converted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.email_leads ADD COLUMN IF NOT EXISTS is_enquiry_converted BOOLEAN NOT NULL DEFAULT false;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_call_logs_enquiry_converted ON public.call_logs(is_enquiry_converted) WHERE is_enquiry_converted = true;
CREATE INDEX IF NOT EXISTS idx_interakt_leads_enquiry_converted ON public.interakt_leads(is_enquiry_converted) WHERE is_enquiry_converted = true;
CREATE INDEX IF NOT EXISTS idx_form_leads_enquiry_converted ON public.form_leads(is_enquiry_converted) WHERE is_enquiry_converted = true;
CREATE INDEX IF NOT EXISTS idx_email_leads_enquiry_converted ON public.email_leads(is_enquiry_converted) WHERE is_enquiry_converted = true;
