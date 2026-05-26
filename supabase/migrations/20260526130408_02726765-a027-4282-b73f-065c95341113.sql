-- Clear tracking info in internal orders table
UPDATE orders
SET tracking_number = NULL,
    tracking_url = NULL,
    courier_name = NULL,
    actual_delivery = NULL
WHERE external_id = '141736'
  AND source = 'website';

-- Clear tracking info in woocommerce_orders mirror
UPDATE woocommerce_orders
SET tracking_number = NULL,
    courier = NULL,
    expected_delivery = NULL,
    tracking_status = NULL,
    updated_at = now()
WHERE woo_order_id = '141736'
   OR order_number = '141736';