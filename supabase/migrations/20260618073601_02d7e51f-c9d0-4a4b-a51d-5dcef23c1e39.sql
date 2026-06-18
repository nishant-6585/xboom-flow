UPDATE public.shopify_orders_raw
SET processing_status = 'pending', retry_count = 0, last_error = NULL
WHERE webhook_topic = 'orders/updated'
  AND processing_status = 'processing';