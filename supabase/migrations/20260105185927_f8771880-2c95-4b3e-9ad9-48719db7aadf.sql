-- Add supplier_id and quantity_procured columns to order_items table
ALTER TABLE public.order_items 
ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id),
ADD COLUMN quantity_procured integer DEFAULT 0;

-- Add index for supplier lookups
CREATE INDEX idx_order_items_supplier_id ON public.order_items(supplier_id);