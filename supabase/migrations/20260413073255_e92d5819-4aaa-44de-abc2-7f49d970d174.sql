-- Create woocommerce_orders table (mirrors shopify_orders structure)
CREATE TABLE public.woocommerce_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  woo_order_id TEXT NOT NULL UNIQUE,
  order_number TEXT,
  source TEXT NOT NULL DEFAULT 'xboom_website',
  order_status TEXT DEFAULT 'pending',
  financial_status TEXT,
  fulfillment_status TEXT DEFAULT 'unfulfilled',
  product_name TEXT NOT NULL DEFAULT '',
  product_code TEXT,
  product_category TEXT DEFAULT 'Consumer Drones',
  quantity INTEGER NOT NULL DEFAULT 1,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_company TEXT DEFAULT '',
  customer_email TEXT DEFAULT '',
  customer_phone TEXT,
  shipping_address TEXT,
  selling_price NUMERIC DEFAULT 0,
  total_sales_amount NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  currency TEXT DEFAULT 'INR',
  line_items JSONB,
  raw_data JSONB,
  internal_notes TEXT,
  sales_notes TEXT,
  woo_created_at TIMESTAMPTZ,
  woo_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.woocommerce_orders ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can view woocommerce orders"
  ON public.woocommerce_orders
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update (webhook)
CREATE POLICY "Service role can insert woocommerce orders"
  ON public.woocommerce_orders
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update woocommerce orders"
  ON public.woocommerce_orders
  FOR UPDATE
  TO service_role
  USING (true);

-- Index for performance
CREATE INDEX idx_woocommerce_orders_woo_order_id ON public.woocommerce_orders(woo_order_id);
CREATE INDEX idx_woocommerce_orders_created_at ON public.woocommerce_orders(created_at DESC);
CREATE INDEX idx_woocommerce_orders_source ON public.woocommerce_orders(source);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.woocommerce_orders;

-- Auto-update updated_at
CREATE TRIGGER update_woocommerce_orders_updated_at
  BEFORE UPDATE ON public.woocommerce_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();