
-- Drop existing sharing policies
DROP POLICY IF EXISTS "Owner can manage folder shares" ON public.hr_folder_shares;
DROP POLICY IF EXISTS "Authenticated users can manage folder shares" ON public.hr_folder_shares;
DROP POLICY IF EXISTS "Owner can manage document shares" ON public.hr_document_shares;
DROP POLICY IF EXISTS "Authenticated users can manage document shares" ON public.hr_document_shares;

-- Folder shares: only creator or admin can insert/update/delete
CREATE POLICY "Owner or admin can manage folder shares"
ON public.hr_folder_shares
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.hr_folders f WHERE f.id = folder_id AND f.created_by = auth.uid())
  OR public.is_hr_or_admin(auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.hr_folders f WHERE f.id = folder_id AND f.created_by = auth.uid())
  OR public.is_hr_or_admin(auth.uid())
);

-- Document shares: only uploader or admin can insert/update/delete
CREATE POLICY "Owner or admin can manage document shares"
ON public.hr_document_shares
FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.hr_documents d WHERE d.id = document_id AND d.uploaded_by = auth.uid())
  OR public.is_hr_or_admin(auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.hr_documents d WHERE d.id = document_id AND d.uploaded_by = auth.uid())
  OR public.is_hr_or_admin(auth.uid())
);
