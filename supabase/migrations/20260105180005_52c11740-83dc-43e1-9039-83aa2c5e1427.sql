-- Add lead_source column to orders table
ALTER TABLE public.orders ADD COLUMN lead_source text;