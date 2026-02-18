
-- Create dedicated shopify_orders table (fully separate from orders table)
CREATE TABLE public.shopify_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  order_number TEXT,
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
  fulfillment_status TEXT DEFAULT 'unfulfilled',
  financial_status TEXT,
  order_status TEXT DEFAULT 'open',
  currency TEXT DEFAULT 'INR',
  line_items JSONB,
  internal_notes TEXT,
  sales_notes TEXT,
  tags TEXT,
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_domain, shopify_order_id)
);

-- Enable RLS
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

-- Allow approved users to view shopify orders
CREATE POLICY "Approved users can view shopify orders"
  ON public.shopify_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_approved = true
    )
  );

-- Allow admins to insert/update shopify orders
CREATE POLICY "Admins can insert shopify orders"
  ON public.shopify_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update shopify orders"
  ON public.shopify_orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role bypass (needed for edge function with service role key)
CREATE POLICY "Service role has full access to shopify orders"
  ON public.shopify_orders FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Updated at trigger
CREATE TRIGGER update_shopify_orders_updated_at
  BEFORE UPDATE ON public.shopify_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing Shopify orders from orders table to shopify_orders
INSERT INTO public.shopify_orders (
  shopify_order_id,
  shop_domain,
  order_number,
  product_name,
  product_code,
  product_category,
  quantity,
  customer_name,
  customer_company,
  customer_email,
  shipping_address,
  selling_price,
  total_sales_amount,
  amount_paid,
  payment_status,
  fulfillment_status,
  internal_notes,
  sales_notes,
  shopify_created_at,
  created_at,
  updated_at
)
SELECT
  COALESCE(
    (regexp_match(internal_notes, 'Shopify Order #(\d+)'))[1],
    id::text
  ) AS shopify_order_id,
  REPLACE(lead_source, 'shopify:', '') AS shop_domain,
  (regexp_match(internal_notes, 'Shopify Order #(\d+)'))[1] AS order_number,
  product_name,
  product_code,
  COALESCE(product_category, 'Consumer Drones'),
  quantity,
  customer_name,
  COALESCE(customer_company, ''),
  COALESCE(customer_email, ''),
  shipping_address,
  COALESCE(selling_price, 0),
  COALESCE(total_sales_amount, 0),
  COALESCE(amount_paid, 0),
  COALESCE(payment_status, 'pending'),
  COALESCE(sales_notes, 'unfulfilled'),
  internal_notes,
  sales_notes,
  created_at,
  created_at,
  updated_at
FROM public.orders
WHERE lead_source LIKE 'shopify:%'
ON CONFLICT (shop_domain, shopify_order_id) DO NOTHING;

-- Delete migrated Shopify orders from the orders table
DELETE FROM public.orders WHERE lead_source LIKE 'shopify:%';
