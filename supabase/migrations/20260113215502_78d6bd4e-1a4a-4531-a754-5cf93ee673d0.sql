-- Create payment status requests table for procurement
CREATE TABLE public.procurement_payment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  requested_by_name TEXT NOT NULL,
  request_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID,
  approved_by_name TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.procurement_payment_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
-- All authenticated users can view requests (needed for UI)
CREATE POLICY "Authenticated users can view payment requests"
ON public.procurement_payment_requests
FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

-- Supply chain and admin can create requests
CREATE POLICY "Supply chain and admin can create payment requests"
ON public.procurement_payment_requests
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND
  (has_role(auth.uid(), 'supply_chain') OR has_role(auth.uid(), 'admin'))
);

-- Only admin can update requests (approve/reject)
CREATE POLICY "Only admin can update payment requests"
ON public.procurement_payment_requests
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

-- Only admin can delete requests
CREATE POLICY "Only admin can delete payment requests"
ON public.procurement_payment_requests
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin') AND is_user_approved(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_procurement_payment_requests_updated_at
BEFORE UPDATE ON public.procurement_payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_procurement_payment_requests_order_id ON public.procurement_payment_requests(order_id);
CREATE INDEX idx_procurement_payment_requests_status ON public.procurement_payment_requests(status);