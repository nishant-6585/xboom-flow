-- Fix 1: Make invoices and purchase-orders buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('invoices', 'purchase-orders');

-- Fix 2: Remove the overly permissive "Anyone can view invoices" policy
DROP POLICY IF EXISTS "Anyone can view invoices" ON storage.objects;

-- Fix 3: Create proper role-based view policies for invoices
CREATE POLICY "Admin can view all invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'invoices' 
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Finance can view all invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'invoices' 
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'finance'::app_role)
);

CREATE POLICY "Supply chain can view all invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'invoices' 
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'supply_chain'::app_role)
);

CREATE POLICY "Sales can view invoices for their orders"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'invoices' 
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);