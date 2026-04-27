-- One-time recompute of bucket based on current order_status
UPDATE public.woocommerce_orders
SET bucket = CASE
  WHEN order_status IN ('processing', 'completed') THEN 'orders'
  ELSE 'abandoned'
END
WHERE bucket IS DISTINCT FROM (
  CASE WHEN order_status IN ('processing', 'completed') THEN 'orders' ELSE 'abandoned' END
);