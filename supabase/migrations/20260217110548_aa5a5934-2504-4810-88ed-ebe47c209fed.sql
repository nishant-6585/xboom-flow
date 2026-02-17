
-- Create processing status enum
CREATE TYPE public.shopify_processing_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Replace processed boolean with richer columns
ALTER TABLE public.shopify_orders_raw
  DROP COLUMN IF EXISTS processed;

ALTER TABLE public.shopify_orders_raw
  ADD COLUMN processing_status public.shopify_processing_status NOT NULL DEFAULT 'pending',
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_error TEXT,
  ADD COLUMN processed_at TIMESTAMPTZ;

-- Drop old index and create new ones
DROP INDEX IF EXISTS idx_shopify_orders_raw_processed;
CREATE INDEX idx_shopify_orders_raw_pending ON public.shopify_orders_raw (processing_status, created_at)
  WHERE processing_status IN ('pending', 'failed');
CREATE INDEX idx_shopify_orders_raw_retry ON public.shopify_orders_raw (retry_count)
  WHERE processing_status = 'failed' AND retry_count < 5;
