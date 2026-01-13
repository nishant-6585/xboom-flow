-- Create inventory_procurements table for standalone procurement (without orders)
CREATE TABLE public.inventory_procurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL DEFAULT 'Consumer Drones',
  product_code TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  total_amount NUMERIC,
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name TEXT,
  payment_terms TEXT,
  payment_due_date DATE,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  procurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  inventory_id UUID REFERENCES public.inventory(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_procurements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Supply chain can view all inventory procurements"
ON public.inventory_procurements FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can view all inventory procurements"
ON public.inventory_procurements FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can create inventory procurements"
ON public.inventory_procurements FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can create inventory procurements"
ON public.inventory_procurements FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can update inventory procurements"
ON public.inventory_procurements FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can update inventory procurements"
ON public.inventory_procurements FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete inventory procurements"
ON public.inventory_procurements FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_inventory_procurements_updated_at
BEFORE UPDATE ON public.inventory_procurements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add inventory_procurement_id to supplier_payments for linking payments to standalone procurements
ALTER TABLE public.supplier_payments 
ADD COLUMN inventory_procurement_id UUID REFERENCES public.inventory_procurements(id);

-- Add inventory_procurement_id to inventory_transactions for tracking source
ALTER TABLE public.inventory_transactions
ADD COLUMN inventory_procurement_id UUID REFERENCES public.inventory_procurements(id);