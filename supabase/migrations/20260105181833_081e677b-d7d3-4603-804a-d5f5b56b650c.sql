-- Create order_items table for multiple products per order
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_code TEXT,
  product_category TEXT DEFAULT 'Consumer Drones',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  procurement_rate NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies matching orders table access patterns
CREATE POLICY "Admin can view order items"
ON public.order_items FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can view order items"
ON public.order_items FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Sales can view own order items"
ON public.order_items FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role) 
  AND EXISTS (
    SELECT 1 FROM public.orders o 
    WHERE o.id = order_items.order_id 
    AND o.sales_person_id = auth.uid()
  )
);

CREATE POLICY "Admin can create order items"
ON public.order_items FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can create order items"
ON public.order_items FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can update order items"
ON public.order_items FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can update order items"
ON public.order_items FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can delete order items"
ON public.order_items FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can delete order items"
ON public.order_items FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);