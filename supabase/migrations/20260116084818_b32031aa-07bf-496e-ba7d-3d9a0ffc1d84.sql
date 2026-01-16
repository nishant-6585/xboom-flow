-- Create junction table for expense-order links (many-to-many)
CREATE TABLE public.expense_order_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(expense_id, order_id)
);

-- Create junction table for expense-procurement links (many-to-many)
CREATE TABLE public.expense_procurement_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  procurement_id UUID NOT NULL REFERENCES public.inventory_procurements(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(expense_id, procurement_id)
);

-- Enable RLS
ALTER TABLE public.expense_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_procurement_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for expense_order_links
CREATE POLICY "Authenticated users can view expense order links"
  ON public.expense_order_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert expense order links"
  ON public.expense_order_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expense order links"
  ON public.expense_order_links FOR DELETE
  TO authenticated
  USING (true);

-- RLS policies for expense_procurement_links
CREATE POLICY "Authenticated users can view expense procurement links"
  ON public.expense_procurement_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert expense procurement links"
  ON public.expense_procurement_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expense procurement links"
  ON public.expense_procurement_links FOR DELETE
  TO authenticated
  USING (true);