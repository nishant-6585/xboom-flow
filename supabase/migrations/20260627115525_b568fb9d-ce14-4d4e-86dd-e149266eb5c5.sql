
CREATE TABLE public.spare_parts_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  part_id UUID NOT NULL REFERENCES public.spare_parts_inventory(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sale_price NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  buyer_name TEXT,
  buyer_phone TEXT,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  sold_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spare_parts_sales_part_id ON public.spare_parts_sales(part_id);
CREATE INDEX idx_spare_parts_sales_sale_date ON public.spare_parts_sales(sale_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spare_parts_sales TO authenticated;
GRANT ALL ON public.spare_parts_sales TO service_role;

ALTER TABLE public.spare_parts_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spare_parts_sales_select"
ON public.spare_parts_sales FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supply_chain')
  OR public.has_role(auth.uid(), 'finance')
  OR public.has_role(auth.uid(), 'sales')
);

CREATE POLICY "spare_parts_sales_insert"
ON public.spare_parts_sales FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supply_chain')
);

CREATE POLICY "spare_parts_sales_update"
ON public.spare_parts_sales FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supply_chain'));

CREATE POLICY "spare_parts_sales_delete"
ON public.spare_parts_sales FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_spare_parts_sales_updated_at
BEFORE UPDATE ON public.spare_parts_sales
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
