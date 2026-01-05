-- Add po_url column to orders table for storing PO attachment
ALTER TABLE public.orders ADD COLUMN po_url text;