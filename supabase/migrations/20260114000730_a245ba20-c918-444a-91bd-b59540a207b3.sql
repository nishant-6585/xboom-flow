-- Create expected_payments table for cashflow tracking
CREATE TABLE public.expected_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'pipeline', 'order'
  source_id UUID, -- Reference to pipeline_orders or orders
  order_number TEXT,
  customer_name TEXT NOT NULL,
  customer_company TEXT,
  amount NUMERIC NOT NULL,
  expected_date DATE NOT NULL,
  actual_received_date DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'received', 'overdue', 'cancelled'
  notes TEXT,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expected_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only admin and finance can access
CREATE POLICY "Admin can manage expected payments"
  ON public.expected_payments FOR ALL
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance can view expected payments"
  ON public.expected_payments FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can create expected payments"
  ON public.expected_payments FOR INSERT
  WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can update expected payments"
  ON public.expected_payments FOR UPDATE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_expected_payments_updated_at
  BEFORE UPDATE ON public.expected_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();