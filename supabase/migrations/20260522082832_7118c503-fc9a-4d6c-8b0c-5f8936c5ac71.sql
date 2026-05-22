
REVOKE EXECUTE ON FUNCTION public.mark_website_order_paid(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_website_order(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_mark_website_payment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._create_procurement_for_order(public.orders) FROM PUBLIC, anon;
