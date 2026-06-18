UPDATE public.shopify_orders_raw
SET processing_status = 'pending', retry_count = 0, last_error = NULL
WHERE webhook_topic = 'orders/updated'
  AND processing_status = 'failed'
  AND last_error LIKE '%Status verification failed%shopify_updated_at%';