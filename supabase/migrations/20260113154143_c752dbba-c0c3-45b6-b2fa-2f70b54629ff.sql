-- Allow admins to delete any payment record (not just their own)
-- Note: Admins already have delete policy via "Admins can delete payment records"
-- Just need to add storage delete policy for admins

-- Add DELETE policy for admins to delete any payment screenshots
CREATE POLICY "Admins can delete any payment screenshots"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-screenshots'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Add DELETE policy for sales users to delete their own PO files
CREATE POLICY "Sales can delete own purchase orders"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'purchase-orders'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add DELETE policy for admins to delete any PO files
CREATE POLICY "Admins can delete any purchase orders"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'purchase-orders'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'admin'::app_role)
);