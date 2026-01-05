-- Add lead_time column to pricelist table
ALTER TABLE public.pricelist ADD COLUMN lead_time text DEFAULT NULL;