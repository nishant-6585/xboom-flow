DROP TRIGGER IF EXISTS trg_validate_order_delivery_proof ON public.orders;
DROP FUNCTION IF EXISTS public.validate_order_delivery_proof();