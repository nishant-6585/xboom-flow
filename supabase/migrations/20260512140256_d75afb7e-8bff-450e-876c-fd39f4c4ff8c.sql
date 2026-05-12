ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS estimated_procurement_rate numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_procurement_rate numeric;