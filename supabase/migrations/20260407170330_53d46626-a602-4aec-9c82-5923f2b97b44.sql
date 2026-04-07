ALTER TABLE public.pipeline_orders ADD COLUMN lost_reason TEXT DEFAULT NULL;
ALTER TABLE public.pipeline_orders ADD COLUMN lost_reason_notes TEXT DEFAULT NULL;