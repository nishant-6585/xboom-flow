
ALTER TABLE public.interakt_leads
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS updated_by text;
