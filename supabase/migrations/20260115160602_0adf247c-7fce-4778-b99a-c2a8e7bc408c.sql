-- Add columns to track if price includes GST
ALTER TABLE public.order_items 
ADD COLUMN sales_price_includes_gst BOOLEAN DEFAULT false,
ADD COLUMN procurement_price_includes_gst BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.order_items.sales_price_includes_gst IS 'Whether the unit_price includes GST';
COMMENT ON COLUMN public.order_items.procurement_price_includes_gst IS 'Whether the procurement_rate includes GST';