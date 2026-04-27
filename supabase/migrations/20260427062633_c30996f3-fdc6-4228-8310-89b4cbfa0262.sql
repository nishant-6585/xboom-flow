-- Drop the bucket column and its index. Status is now the single source of truth.
DROP INDEX IF EXISTS public.idx_woocommerce_orders_bucket;
ALTER TABLE public.woocommerce_orders DROP COLUMN IF EXISTS bucket;

-- Helpful index for status-based filtering in the UI
CREATE INDEX IF NOT EXISTS idx_woocommerce_orders_order_status
  ON public.woocommerce_orders (order_status);