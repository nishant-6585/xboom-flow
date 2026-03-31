
-- Add customer_type column to all lead tables
ALTER TABLE public.interakt_leads ADD COLUMN IF NOT EXISTS customer_type text DEFAULT NULL;
ALTER TABLE public.email_leads ADD COLUMN IF NOT EXISTS customer_type text DEFAULT NULL;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS customer_type text DEFAULT NULL;
ALTER TABLE public.form_leads ADD COLUMN IF NOT EXISTS customer_type text DEFAULT NULL;
