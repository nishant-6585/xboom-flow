-- Create pipeline_orders table for hot pipeline tracking
CREATE TABLE public.pipeline_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_company TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_notes TEXT,
  product_name TEXT NOT NULL,
  product_category TEXT DEFAULT 'Consumer Drones',
  product_code TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  expected_price NUMERIC,
  expected_closure_date DATE,
  status TEXT NOT NULL DEFAULT 'pending_confirmation',
  sales_person_id UUID NOT NULL,
  sales_person_name TEXT NOT NULL,
  lead_source TEXT,
  priority INTEGER DEFAULT 3,
  internal_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.pipeline_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Sales can view own pipeline orders"
ON public.pipeline_orders
FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND sales_person_id = auth.uid());

CREATE POLICY "Sales can create own pipeline orders"
ON public.pipeline_orders
FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND sales_person_id = auth.uid());

CREATE POLICY "Sales can update own pipeline orders"
ON public.pipeline_orders
FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND sales_person_id = auth.uid());

CREATE POLICY "Sales can delete own pipeline orders"
ON public.pipeline_orders
FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND sales_person_id = auth.uid());

CREATE POLICY "Admin can view all pipeline orders"
ON public.pipeline_orders
FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can create pipeline orders"
ON public.pipeline_orders
FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can update pipeline orders"
ON public.pipeline_orders
FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can delete pipeline orders"
ON public.pipeline_orders
FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can view all pipeline orders"
ON public.pipeline_orders
FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_pipeline_orders_updated_at
BEFORE UPDATE ON public.pipeline_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_orders;