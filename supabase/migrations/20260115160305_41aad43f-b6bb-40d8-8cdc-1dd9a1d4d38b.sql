-- Add GST fields for sales (selling price) on order items
ALTER TABLE public.order_items 
ADD COLUMN sales_gst_percent NUMERIC DEFAULT 0,
ADD COLUMN sales_gst_amount NUMERIC DEFAULT 0;

-- Add GST fields for procurement (cost price) on order items
ALTER TABLE public.order_items 
ADD COLUMN procurement_gst_percent NUMERIC DEFAULT 0,
ADD COLUMN procurement_gst_amount NUMERIC DEFAULT 0;

-- Add comments for clarity
COMMENT ON COLUMN public.order_items.sales_gst_percent IS 'GST percentage applied to the selling price';
COMMENT ON COLUMN public.order_items.sales_gst_amount IS 'GST amount calculated on the selling price';
COMMENT ON COLUMN public.order_items.procurement_gst_percent IS 'GST percentage applied to the procurement/cost price';
COMMENT ON COLUMN public.order_items.procurement_gst_amount IS 'GST amount calculated on the procurement/cost price';