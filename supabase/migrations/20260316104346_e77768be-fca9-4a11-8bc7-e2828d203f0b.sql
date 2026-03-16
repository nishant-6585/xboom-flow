ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pan_number TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'New Regime';