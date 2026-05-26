UPDATE public.orders o
SET status = 'in_transit'::public.order_status,
    updated_at = now()
FROM public.woocommerce_orders w
WHERE o.source = 'website'
  AND o.external_id = w.woo_order_id
  AND lower(w.order_status) = 'shipped'
  AND o.status <> 'in_transit'::public.order_status;