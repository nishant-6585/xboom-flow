
-- Add webhook_topic column to shopify_orders_raw
ALTER TABLE public.shopify_orders_raw 
ADD COLUMN IF NOT EXISTS webhook_topic TEXT DEFAULT 'orders/create';
