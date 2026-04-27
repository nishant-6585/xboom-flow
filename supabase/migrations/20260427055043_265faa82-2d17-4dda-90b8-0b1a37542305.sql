ALTER TABLE public.woocommerce_orders
  ADD COLUMN IF NOT EXISTS tracking_status text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS courier text,
  ADD COLUMN IF NOT EXISTS expected_delivery date;

CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_customer_phone
  ON public.woocommerce_orders (customer_phone);