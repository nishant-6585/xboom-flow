-- Create storage bucket for payment screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-screenshots', 'payment-screenshots', true);

-- Storage policies for payment screenshots
CREATE POLICY "Authenticated users can upload payment screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-screenshots');

CREATE POLICY "Anyone can view payment screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-screenshots');

CREATE POLICY "Admins can delete payment screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payment-screenshots' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create payment records table
CREATE TABLE public.payment_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  screenshot_url TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_records
CREATE POLICY "Users can view payment records for their orders"
ON public.payment_records
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    -- Admin/supply chain can see all
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'supply_chain') OR
    -- Sales can see their own order payments
    (has_role(auth.uid(), 'sales') AND EXISTS (
      SELECT 1 FROM public.orders o 
      WHERE o.id = order_id AND o.sales_person_id = auth.uid()
    ))
  )
);

CREATE POLICY "Authenticated users can submit payment records"
ON public.payment_records
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) AND
  submitted_by = auth.uid()
);

CREATE POLICY "Admins can update payment records"
ON public.payment_records
FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND
  has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete payment records"
ON public.payment_records
FOR DELETE
USING (
  is_user_approved(auth.uid()) AND
  has_role(auth.uid(), 'admin')
);