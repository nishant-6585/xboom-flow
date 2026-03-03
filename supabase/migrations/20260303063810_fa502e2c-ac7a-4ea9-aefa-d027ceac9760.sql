
-- Fix hr_documents: replace ALL policy with separate INSERT/UPDATE/DELETE (no SELECT)
DROP POLICY IF EXISTS "HR/Admin can manage all documents" ON public.hr_documents;

CREATE POLICY "HR/Admin can insert documents"
  ON public.hr_documents FOR INSERT
  TO authenticated
  WITH CHECK (is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can update documents"
  ON public.hr_documents FOR UPDATE
  TO authenticated
  USING (is_hr_or_admin(auth.uid()))
  WITH CHECK (is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can delete documents"
  ON public.hr_documents FOR DELETE
  TO authenticated
  USING (is_hr_or_admin(auth.uid()));

-- Fix hr_folders: replace ALL policy with separate INSERT/UPDATE/DELETE (no SELECT)
DROP POLICY IF EXISTS "HR/Admin can manage all folders" ON public.hr_folders;

CREATE POLICY "HR/Admin can insert folders"
  ON public.hr_folders FOR INSERT
  TO authenticated
  WITH CHECK (is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can update folders"
  ON public.hr_folders FOR UPDATE
  TO authenticated
  USING (is_hr_or_admin(auth.uid()))
  WITH CHECK (is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can delete folders"
  ON public.hr_folders FOR DELETE
  TO authenticated
  USING (is_hr_or_admin(auth.uid()));
