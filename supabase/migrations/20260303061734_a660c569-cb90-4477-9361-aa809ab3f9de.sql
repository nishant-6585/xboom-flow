
-- Fix can_view_hr_folder: remove the buggy "= false" condition that grants everyone access
-- Add Vishal Saurav (a8050cc3-7d17-44ac-a083-d8023d505331) as an authorized viewer
CREATE OR REPLACE FUNCTION public.can_view_hr_folder(_user_id uuid, _folder_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- HR/Admin always have access
    is_hr_or_admin(_user_id)
    -- Vishal Saurav always has access
    OR _user_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
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

-- Fix can_view_hr_document: add Vishal Saurav as authorized viewer
CREATE OR REPLACE FUNCTION public.can_view_hr_document(_user_id uuid, _document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- HR/Admin always have access
    is_hr_or_admin(_user_id)
    -- Vishal Saurav always has access
    OR _user_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
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
