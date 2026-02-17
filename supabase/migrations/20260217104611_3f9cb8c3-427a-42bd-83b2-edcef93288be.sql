
-- Create table for raw Shopify order webhook payloads
CREATE TABLE public.shopify_orders_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  order_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Idempotency: prevent duplicate webhook deliveries
  CONSTRAINT uq_shopify_orders_raw_shop_order UNIQUE (shop_domain, order_id)
);

-- Indexes for common queries
CREATE INDEX idx_shopify_orders_raw_order_id ON public.shopify_orders_raw (order_id);
CREATE INDEX idx_shopify_orders_raw_shop_domain ON public.shopify_orders_raw (shop_domain);
CREATE INDEX idx_shopify_orders_raw_processed ON public.shopify_orders_raw (processed) WHERE processed = false;

-- Enable Row Level Security
ALTER TABLE public.shopify_orders_raw ENABLE ROW LEVEL SECURITY;

-- Admin-only read access (edge functions use service_role which bypasses RLS)
CREATE POLICY "Admins can view shopify orders"
  ON public.shopify_orders_raw
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
    )
  );
