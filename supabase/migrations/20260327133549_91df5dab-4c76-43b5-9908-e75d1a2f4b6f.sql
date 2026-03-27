
-- Add lead-form fields to interakt_leads
ALTER TABLE public.interakt_leads
  ADD COLUMN IF NOT EXISTS customer_company text,
  ADD COLUMN IF NOT EXISTS product_category text DEFAULT 'Consumer Drones',
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS requested_timeline text,
  ADD COLUMN IF NOT EXISTS purpose_of_purchase text;

-- Add lead-form fields to call_logs
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_company text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS product_category text DEFAULT 'Consumer Drones',
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS requested_timeline text,
  ADD COLUMN IF NOT EXISTS purpose_of_purchase text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Add lead-form fields to prospects
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS product_category text DEFAULT 'Consumer Drones',
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS urgency text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS requested_timeline text,
  ADD COLUMN IF NOT EXISTS purpose_of_purchase text,
  ADD COLUMN IF NOT EXISTS customer_company text;
