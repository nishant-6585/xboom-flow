-- Create supplier_quotations table for comparing quotes
CREATE TABLE public.supplier_quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  unit_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_amount NUMERIC GENERATED ALWAYS AS (unit_price * quantity) STORED,
  payment_terms TEXT,
  lead_time TEXT,
  validity_date DATE,
  notes TEXT,
  is_selected BOOLEAN DEFAULT false,
  quoted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  quoted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supplier_quotations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admin can manage supplier quotations"
ON public.supplier_quotations FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can manage supplier quotations"
ON public.supplier_quotations FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Finance can view supplier quotations"
ON public.supplier_quotations FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_supplier_quotations_order_id ON public.supplier_quotations(order_id);
CREATE INDEX idx_supplier_quotations_order_item_id ON public.supplier_quotations(order_item_id);
CREATE INDEX idx_supplier_quotations_supplier_id ON public.supplier_quotations(supplier_id);