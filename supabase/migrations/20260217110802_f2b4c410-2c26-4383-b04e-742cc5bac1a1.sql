
-- Function to fetch pending orders with row-level locking (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.fetch_pending_shopify_orders(batch_size INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  shop_domain TEXT,
  order_id TEXT,
  payload JSONB,
  retry_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.shopify_orders_raw AS sor
  SET processing_status = 'processing'
  FROM (
    SELECT s.id
    FROM public.shopify_orders_raw s
    WHERE s.processing_status IN ('pending', 'failed')
      AND s.retry_count < 5
    ORDER BY s.created_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  ) AS locked
  WHERE sor.id = locked.id
  RETURNING sor.id, sor.shop_domain, sor.order_id, sor.payload, sor.retry_count, sor.created_at, sor.created_at;
END;
$$;

-- Function for monitoring stats
CREATE OR REPLACE FUNCTION public.get_shopify_processing_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'pending', COUNT(*) FILTER (WHERE processing_status = 'pending'),
    'processing', COUNT(*) FILTER (WHERE processing_status = 'processing'),
    'completed', COUNT(*) FILTER (WHERE processing_status = 'completed'),
    'failed', COUNT(*) FILTER (WHERE processing_status = 'failed'),
    'total', COUNT(*),
    'max_retries_hit', COUNT(*) FILTER (WHERE retry_count >= 5),
    'last_processed_at', MAX(processed_at),
    'oldest_pending', MIN(created_at) FILTER (WHERE processing_status IN ('pending', 'failed'))
  ) INTO result
  FROM public.shopify_orders_raw;
  
  RETURN result;
END;
$$;

-- Add updated_at column for backoff tracking
ALTER TABLE public.shopify_orders_raw
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger to auto-update updated_at
CREATE TRIGGER update_shopify_orders_raw_updated_at
  BEFORE UPDATE ON public.shopify_orders_raw
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
