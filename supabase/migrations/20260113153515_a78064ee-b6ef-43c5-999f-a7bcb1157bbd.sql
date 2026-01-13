-- Add DELETE policy for sales users to delete their own payment records (only pending ones)
CREATE POLICY "Sales can delete own pending payment records"
ON public.payment_records
FOR DELETE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role)
  AND submitted_by = auth.uid()
  AND status = 'pending'
);

-- Add DELETE policy for sales users to delete their own payment screenshots
CREATE POLICY "Sales can delete own payment screenshots"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-screenshots'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);