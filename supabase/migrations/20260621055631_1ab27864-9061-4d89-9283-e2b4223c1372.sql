
-- 1. Interakt leads: role-scoped SELECT
DROP POLICY IF EXISTS "Approved users can view interakt leads" ON public.interakt_leads;
CREATE POLICY "Authorized roles can view interakt leads"
ON public.interakt_leads
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

-- 2. signed-invoices bucket: role-scoped SELECT
DROP POLICY IF EXISTS "Authenticated users can view signed invoices" ON storage.objects;
CREATE POLICY "Authorized roles can view signed invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signed-invoices'
  AND is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  )
);

-- 3. training-pictures bucket: restrict DELETE to admin/hr/owner
DROP POLICY IF EXISTS "Approved users can delete training pictures" ON storage.objects;
CREATE POLICY "Admins HR or owner can delete training pictures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'training-pictures'
  AND is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
