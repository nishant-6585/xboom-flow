
-- Fix 1: Buyback Drones - add approval gate and role-based access
DROP POLICY IF EXISTS "Authenticated users can view all drones" ON public.buyback_drones;
DROP POLICY IF EXISTS "Authenticated users can insert drones" ON public.buyback_drones;
DROP POLICY IF EXISTS "Authenticated users can update drones" ON public.buyback_drones;
DROP POLICY IF EXISTS "Authenticated users can delete drones" ON public.buyback_drones;

CREATE POLICY "Approved users can view drones"
  ON public.buyback_drones FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Admin and supply chain can insert drones"
  ON public.buyback_drones FOR INSERT
  WITH CHECK (
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
  );

CREATE POLICY "Admin and supply chain can update drones"
  ON public.buyback_drones FOR UPDATE
  USING (
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
  );

CREATE POLICY "Admin and supply chain can delete drones"
  ON public.buyback_drones FOR DELETE
  USING (
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
  );

-- Fix 2: Storage bucket policies - add approval and role checks

-- billing-attachments
DROP POLICY IF EXISTS "Authenticated users can view billing attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload billing attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete billing attachments" ON storage.objects;

CREATE POLICY "Approved finance/admin can view billing attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'billing-attachments' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Approved finance/admin can upload billing attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'billing-attachments' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Approved finance/admin can delete billing attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'billing-attachments' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

-- import-documents
DROP POLICY IF EXISTS "Authenticated users can view import documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload import documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update import documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete import documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view import documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload import documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update import documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete import documents" ON storage.objects;

CREATE POLICY "Approved admin/supply_chain can view import documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'import-documents' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role) OR has_role(auth.uid(), 'finance'::app_role)));

CREATE POLICY "Approved admin/supply_chain can upload import documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'import-documents' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Approved admin/supply_chain can update import documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'import-documents' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

CREATE POLICY "Approved admin/supply_chain can delete import documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'import-documents' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role)));

-- training-uploads
DROP POLICY IF EXISTS "Authenticated users can view training uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload training files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view training uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload training files" ON storage.objects;

CREATE POLICY "Approved users can view training uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-uploads' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved hr/admin can upload training files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'training-uploads' AND
    is_user_approved(auth.uid()) AND
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role)));

-- form-attachments
DROP POLICY IF EXISTS "Authenticated users can read form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read form attachments" ON storage.objects;

CREATE POLICY "Approved users can read form attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'form-attachments' AND is_user_approved(auth.uid()));
