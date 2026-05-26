UPDATE public.woocommerce_orders
SET tracking_number = NULL,
    courier = NULL,
    expected_delivery = NULL,
    tracking_status = NULL,
    updated_at = now()
WHERE woo_order_id = '141736' OR order_number = '141736';

UPDATE public.orders
SET tracking_number = NULL,
    tracking_url = NULL
WHERE external_id = '141736' AND source = 'website';