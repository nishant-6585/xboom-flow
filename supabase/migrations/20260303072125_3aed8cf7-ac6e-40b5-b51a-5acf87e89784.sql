
-- Update can_view_hr_folder to support parent folder inheritance
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
        OR (fs.share_type = 'department' AND (
          fs.department IN (SELECT department FROM public.employees WHERE user_id = _user_id)
          OR LOWER(fs.department) IN (SELECT role::text FROM public.user_roles WHERE user_id = _user_id)
        ))
      )
    )
    -- INHERIT from parent folder: if user can view the parent, they can view the child
    OR EXISTS (
      SELECT 1 FROM public.hr_folders f
      WHERE f.id = _folder_id
      AND f.parent_id IS NOT NULL
      AND (
        -- Check parent creator
        EXISTS (
          SELECT 1 FROM public.hr_folders pf
          WHERE pf.id = f.parent_id AND pf.created_by = _user_id
        )
        -- Check parent shares
        OR EXISTS (
          SELECT 1 FROM public.hr_folder_shares pfs
          WHERE pfs.folder_id = f.parent_id
          AND (
            pfs.share_type = 'all'
            OR (pfs.share_type = 'individual' AND pfs.employee_id IN (SELECT id FROM public.employees WHERE user_id = _user_id))
            OR (pfs.share_type = 'department' AND (
              pfs.department IN (SELECT department FROM public.employees WHERE user_id = _user_id)
              OR LOWER(pfs.department) IN (SELECT role::text FROM public.user_roles WHERE user_id = _user_id)
            ))
          )
        )
      )
    )
$$;
