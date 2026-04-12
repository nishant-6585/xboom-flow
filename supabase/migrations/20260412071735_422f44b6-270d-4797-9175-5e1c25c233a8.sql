
-- Add pricing columns
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS quoted_price numeric DEFAULT NULL;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS default_price numeric DEFAULT NULL;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT NULL;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS discount_percentage numeric DEFAULT NULL;

-- Change requested_timeline from text to date
ALTER TABLE public.prospects ALTER COLUMN requested_timeline TYPE date USING CASE WHEN requested_timeline ~ '^\d{4}-\d{2}-\d{2}' THEN requested_timeline::date ELSE NULL END;
