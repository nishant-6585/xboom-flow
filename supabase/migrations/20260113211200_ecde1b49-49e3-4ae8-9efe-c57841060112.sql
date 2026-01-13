-- Add screenshot_urls column to supplier_payments table
ALTER TABLE public.supplier_payments
ADD COLUMN screenshot_urls TEXT[] DEFAULT NULL;

-- Create storage bucket for supplier payment screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-payment-screenshots', 'supplier-payment-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for supplier payment screenshots
CREATE POLICY "Authenticated users can upload supplier payment screenshots"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'supplier-payment-screenshots' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view supplier payment screenshots"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'supplier-payment-screenshots' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Admin and supply chain can delete supplier payment screenshots"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'supplier-payment-screenshots' 
  AND auth.role() = 'authenticated'
  AND (
    public.has_role(auth.uid(), 'admin') 
    OR public.has_role(auth.uid(), 'supply_chain')
  )
);