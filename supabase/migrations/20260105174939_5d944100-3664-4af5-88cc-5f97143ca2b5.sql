-- Add brand_name and gst_number columns to suppliers table
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS gst_number TEXT;