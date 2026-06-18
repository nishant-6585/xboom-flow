DROP FUNCTION IF EXISTS public.fetch_pending_shopify_orders(integer);

CREATE OR REPLACE FUNCTION public.fetch_pending_shopify_orders(batch_size integer DEFAULT 10)
 RETURNS TABLE(id uuid, shop_domain text, order_id text, payload jsonb, retry_count integer, created_at timestamp with time zone, updated_at timestamp with time zone, webhook_topic text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  RETURNING sor.id, sor.shop_domain, sor.order_id, sor.payload, sor.retry_count, sor.created_at, sor.updated_at, sor.webhook_topic;
END;
$function$;

UPDATE public.shopify_orders_raw
SET processing_status = 'pending', retry_count = 0, last_error = NULL
WHERE webhook_topic = 'orders/updated'
  AND processing_status = 'completed';