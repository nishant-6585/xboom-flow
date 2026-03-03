
-- 1. Update can_view_hr_folder: remove HR/Admin and Vishal blanket access
CREATE OR REPLACE FUNCTION public.can_view_hr_folder(_user_id uuid, _folder_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- Employee personal folders: only the owning employee
    EXISTS (
      SELECT 1 FROM public.hr_folders f 
      WHERE f.id = _folder_id 
      AND f.folder_type = 'employee_personal' 
      AND f.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id)
    )
    -- Explicitly shared via folder shares
    OR EXISTS (
      SELECT 1 FROM public.hr_folder_shares fs
      WHERE fs.folder_id = _folder_id
      AND (
        fs.share_type = 'all'
        OR (fs.share_type = 'individual' AND fs.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (fs.share_type = 'department' AND fs.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
$$;

-- 2. Update can_view_hr_document: remove HR/Admin and Vishal blanket access
CREATE OR REPLACE FUNCTION public.can_view_hr_document(_user_id uuid, _document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- Explicitly shared via document shares
    EXISTS (
      SELECT 1 FROM public.hr_document_shares ds
      WHERE ds.document_id = _document_id
      AND (
        ds.share_type = 'all'
        OR (ds.share_type = 'individual' AND ds.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (ds.share_type = 'department' AND ds.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
    -- Employee personal folder documents
    OR EXISTS (
      SELECT 1 FROM public.hr_documents d
      JOIN public.hr_folders f ON f.id = d.folder_id
      WHERE d.id = _document_id
      AND f.folder_type = 'employee_personal'
      AND f.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id)
    )
    -- Inherited from folder shares
    OR EXISTS (
      SELECT 1 FROM public.hr_documents d
      JOIN public.hr_folder_shares fs ON fs.folder_id = d.folder_id
      WHERE d.id = _document_id
      AND (
        fs.share_type = 'all'
        OR (fs.share_type = 'individual' AND fs.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (fs.share_type = 'department' AND fs.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
$$;

-- 3. Update SELECT policy on hr_documents: remove is_hr_or_admin bypass
DROP POLICY IF EXISTS "Employees can view accessible documents" ON public.hr_documents;
CREATE POLICY "Employees can view accessible documents"
  ON public.hr_documents FOR SELECT
  TO authenticated
  USING (is_user_approved(auth.uid()) AND can_view_hr_document(auth.uid(), id));

-- 4. Update SELECT policy on hr_folders: remove is_hr_or_admin bypass
DROP POLICY IF EXISTS "Employees can view accessible folders" ON public.hr_folders;
CREATE POLICY "Employees can view accessible folders"
  ON public.hr_folders FOR SELECT
  TO authenticated
  USING (is_user_approved(auth.uid()) AND can_view_hr_folder(auth.uid(), id));

-- 5. Update SELECT on hr_document_shares: also remove HR/Admin blanket read
DROP POLICY IF EXISTS "HR/Admin full access document shares" ON public.hr_document_shares;
CREATE POLICY "HR/Admin manage document shares"
  ON public.hr_document_shares FOR ALL
  TO authenticated
  USING (is_hr_or_admin(auth.uid()))
  WITH CHECK (is_hr_or_admin(auth.uid()));

-- Employees see shares relevant to them
DROP POLICY IF EXISTS "Employees can view document shares" ON public.hr_document_shares;
CREATE POLICY "Employees can view document shares"
  ON public.hr_document_shares FOR SELECT
  TO authenticated
  USING (
    is_user_approved(auth.uid()) AND (
      share_type = 'all'
      OR (share_type = 'individual' AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
      OR (share_type = 'department' AND department IN (SELECT department FROM employees WHERE user_id = auth.uid()))
    )
  );

-- 6. Same for folder shares
DROP POLICY IF EXISTS "HR/Admin full access folder shares" ON public.hr_folder_shares;
CREATE POLICY "HR/Admin manage folder shares"
  ON public.hr_folder_shares FOR ALL
  TO authenticated
  USING (is_hr_or_admin(auth.uid()))
  WITH CHECK (is_hr_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Employees can view folder shares" ON public.hr_folder_shares;
CREATE POLICY "Employees can view folder shares"
  ON public.hr_folder_shares FOR SELECT
  TO authenticated
  USING (
    is_user_approved(auth.uid()) AND (
      share_type = 'all'
      OR (share_type = 'individual' AND employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
      OR (share_type = 'department' AND department IN (SELECT department FROM employees WHERE user_id = auth.uid()))
    )
  );
