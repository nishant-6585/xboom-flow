
-- Update can_view_hr_folder to include creator visibility
CREATE OR REPLACE FUNCTION public.can_view_hr_folder(_user_id uuid, _folder_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- Creator can always see their own folder
    EXISTS (
      SELECT 1 FROM public.hr_folders f
      WHERE f.id = _folder_id AND f.created_by = _user_id
    )
    -- Employee personal folders: only the owning employee
    OR EXISTS (
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

-- Update can_view_hr_document to include creator visibility
CREATE OR REPLACE FUNCTION public.can_view_hr_document(_user_id uuid, _document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    -- Creator can always see their own document
    EXISTS (
      SELECT 1 FROM public.hr_documents d
      WHERE d.id = _document_id AND d.uploaded_by = _user_id
    )
    -- Can view the parent folder
    OR EXISTS (
      SELECT 1 FROM public.hr_documents d
      WHERE d.id = _document_id
      AND can_view_hr_folder(_user_id, d.folder_id)
    )
    -- Explicitly shared via document shares
    OR EXISTS (
      SELECT 1 FROM public.hr_document_shares ds
      WHERE ds.document_id = _document_id
      AND (
        ds.share_type = 'all'
        OR (ds.share_type = 'individual' AND ds.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
        OR (ds.share_type = 'department' AND ds.department IN (SELECT department FROM public.employees WHERE user_id = _user_id))
      )
    )
$$;
