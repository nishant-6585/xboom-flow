
-- 1. attendance_logs self-update field restriction
CREATE OR REPLACE FUNCTION public.attendance_logs_self_update_check(
  _id uuid,
  _status text,
  _approved_by uuid,
  _approved_by_name text,
  _reconciliation_status text,
  _auto_checkout_applied boolean,
  _auto_checkout_time timestamptz,
  _is_provisional_checkout boolean,
  _corrected_by uuid,
  _corrected_at timestamptz,
  _source text
) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_hr_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attendance_logs a
      WHERE a.id = _id
        AND a.status                  IS NOT DISTINCT FROM _status
        AND a.approved_by             IS NOT DISTINCT FROM _approved_by
        AND a.approved_by_name        IS NOT DISTINCT FROM _approved_by_name
        AND a.reconciliation_status   IS NOT DISTINCT FROM _reconciliation_status
        AND a.auto_checkout_applied   IS NOT DISTINCT FROM _auto_checkout_applied
        AND a.auto_checkout_time      IS NOT DISTINCT FROM _auto_checkout_time
        AND a.is_provisional_checkout IS NOT DISTINCT FROM _is_provisional_checkout
        AND a.corrected_by            IS NOT DISTINCT FROM _corrected_by
        AND a.corrected_at            IS NOT DISTINCT FROM _corrected_at
        AND a.source                  IS NOT DISTINCT FROM _source
    );
$$;

DROP POLICY IF EXISTS "Employees can update own attendance" ON public.attendance_logs;

CREATE POLICY "Employees can update own attendance"
ON public.attendance_logs
FOR UPDATE
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND is_user_approved(auth.uid())
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND public.attendance_logs_self_update_check(
    id, status, approved_by, approved_by_name, reconciliation_status,
    auto_checkout_applied, auto_checkout_time, is_provisional_checkout,
    corrected_by, corrected_at, source
  )
);

-- 2. training-pictures bucket: scope INSERT/UPDATE to owner folder or hr/admin
DROP POLICY IF EXISTS "Approved users can upload training pictures" ON storage.objects;
DROP POLICY IF EXISTS "Approved users can update training pictures" ON storage.objects;

CREATE POLICY "Approved users can upload training pictures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'training-pictures'
  AND public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Approved users can update training pictures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'training-pictures'
  AND public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
)
WITH CHECK (
  bucket_id = 'training-pictures'
  AND public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
