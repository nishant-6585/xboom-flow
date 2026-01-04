-- Add new columns for committed timeline, selling price, and product category
ALTER TABLE public.orders 
ADD COLUMN committed_timeline TEXT,
ADD COLUMN selling_price DECIMAL(12, 2),
ADD COLUMN product_category TEXT DEFAULT 'Consumer Drones';

-- Add comment for clarity
COMMENT ON COLUMN public.orders.committed_timeline IS 'The delivery timeline committed to the customer';
COMMENT ON COLUMN public.orders.selling_price IS 'The price at which the product is sold to the customer';
COMMENT ON COLUMN public.orders.product_category IS 'Product category for reporting';