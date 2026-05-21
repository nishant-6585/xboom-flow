
-- Tighten storage bucket policies flagged by security scanner

-- 1. invoices: restrict INSERT to privileged roles or own folder (was open to any authenticated)
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
CREATE POLICY "Privileged roles or uploader can upload invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'finance'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
      OR (storage.foldername(name))[1] = (auth.uid())::text
    )
  );

-- 2. purchase-orders: replace broad "Sales can view own" (no folder filter) with folder-scoped version
DROP POLICY IF EXISTS "Sales can view own purchase orders" ON storage.objects;
CREATE POLICY "Sales can view own purchase orders"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'purchase-orders'
    AND has_role(auth.uid(), 'sales'::app_role)
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Sales can upload purchase orders" ON storage.objects;
CREATE POLICY "Sales can upload purchase orders"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-orders'
    AND has_role(auth.uid(), 'sales'::app_role)
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 3. training-uploads: remove broad public SELECT policy (bucket still public for direct URLs but listing is restricted)
DROP POLICY IF EXISTS "Authenticated users can view training files" ON storage.objects;

-- 4. Make training-uploads bucket private to prevent enumeration; signed URLs should be used
UPDATE storage.buckets SET public = false WHERE id = 'training-uploads';
