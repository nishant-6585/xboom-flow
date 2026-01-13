-- Add procurement_number to inventory_procurements table with auto-generation
ALTER TABLE public.inventory_procurements 
ADD COLUMN IF NOT EXISTS procurement_number TEXT;

-- Create a sequence for procurement numbers
CREATE SEQUENCE IF NOT EXISTS inventory_procurement_number_seq START 1;

-- Create function to generate procurement number
CREATE OR REPLACE FUNCTION public.generate_procurement_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.procurement_number IS NULL THEN
    NEW.procurement_number := 'PROC-' || LPAD(nextval('inventory_procurement_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for auto-generating procurement number
DROP TRIGGER IF EXISTS set_procurement_number ON public.inventory_procurements;
CREATE TRIGGER set_procurement_number
  BEFORE INSERT ON public.inventory_procurements
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_procurement_number();

-- Update existing procurements with procurement numbers
DO $$
DECLARE
  r RECORD;
  counter INT := 1;
BEGIN
  FOR r IN SELECT id FROM public.inventory_procurements WHERE procurement_number IS NULL ORDER BY created_at LOOP
    UPDATE public.inventory_procurements 
    SET procurement_number = 'PROC-' || LPAD(counter::TEXT, 6, '0')
    WHERE id = r.id;
    counter := counter + 1;
  END LOOP;
  
  -- Reset sequence to next available number
  PERFORM setval('inventory_procurement_number_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(procurement_number FROM 6) AS INTEGER)) FROM public.inventory_procurements WHERE procurement_number LIKE 'PROC-%'), 0) + 1, false);
END $$;

-- Create a table to link orders to inventory procurements (when fulfilling from existing stock)
CREATE TABLE IF NOT EXISTS public.order_procurement_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  inventory_procurement_id UUID NOT NULL REFERENCES public.inventory_procurements(id) ON DELETE CASCADE,
  quantity_used INTEGER NOT NULL DEFAULT 1,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  linked_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on order_procurement_links
ALTER TABLE public.order_procurement_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for order_procurement_links
CREATE POLICY "Admin can manage order procurement links" 
ON public.order_procurement_links 
FOR ALL 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can manage order procurement links" 
ON public.order_procurement_links 
FOR ALL 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Finance can view order procurement links" 
ON public.order_procurement_links 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Sales can view their order procurement links" 
ON public.order_procurement_links 
FOR SELECT 
USING (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'sales'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.orders o 
    WHERE o.id = order_procurement_links.order_id 
    AND o.sales_person_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_order_procurement_links_order_id ON public.order_procurement_links(order_id);
CREATE INDEX IF NOT EXISTS idx_order_procurement_links_procurement_id ON public.order_procurement_links(inventory_procurement_id);
CREATE INDEX IF NOT EXISTS idx_inventory_procurements_number ON public.inventory_procurements(procurement_number);