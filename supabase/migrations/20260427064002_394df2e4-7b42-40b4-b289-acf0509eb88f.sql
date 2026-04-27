DROP TRIGGER IF EXISTS trg_abandoned_cart_recovery ON public.woocommerce_orders;
DROP FUNCTION IF EXISTS public.handle_abandoned_cart_recovery();