-- Drop old policy that binds the previous function signature
DROP POLICY IF EXISTS "Employees can update own attendance" ON public.attendance_logs;

-- Recreate check function with extended locked-field coverage
DROP FUNCTION IF EXISTS public.attendance_logs_self_update_check(uuid, uuid, text, text, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.attendance_logs_self_update_check(
  _id uuid,
  _approved_by uuid,
  _approved_by_name text,
  _reconciliation_status text,
  _corrected_by uuid,
  _corrected_at timestamptz,
  _check_in_time timestamptz,
  _check_out_time timestamptz,
  _working_hours numeric,
  _status text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_hr_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attendance_logs a
      WHERE a.id = _id
        AND a.approved_by           IS NOT DISTINCT FROM _approved_by
        AND a.approved_by_name      IS NOT DISTINCT FROM _approved_by_name
        AND a.reconciliation_status IS NOT DISTINCT FROM _reconciliation_status
        AND a.corrected_by          IS NOT DISTINCT FROM _corrected_by
        AND a.corrected_at          IS NOT DISTINCT FROM _corrected_at
        -- check_in_time is immutable for employees once set
        AND (a.check_in_time IS NULL OR a.check_in_time IS NOT DISTINCT FROM _check_in_time)
        -- check_out_time / working_hours / status are frozen for employees
        -- once check_out_time has been recorded (must use correction request flow)
        AND (a.check_out_time IS NULL OR a.check_out_time IS NOT DISTINCT FROM _check_out_time)
        AND (a.check_out_time IS NULL OR a.working_hours  IS NOT DISTINCT FROM _working_hours)
        AND (a.check_out_time IS NULL OR a.status          IS NOT DISTINCT FROM _status)
    );
$$;

CREATE POLICY "Employees can update own attendance"
ON public.attendance_logs
FOR UPDATE
USING (
  (employee_id IN (SELECT employees.id FROM employees WHERE employees.user_id = auth.uid()))
  AND is_user_approved(auth.uid())
)
WITH CHECK (
  (employee_id IN (SELECT employees.id FROM employees WHERE employees.user_id = auth.uid()))
  AND public.attendance_logs_self_update_check(
        id, approved_by, approved_by_name, reconciliation_status,
        corrected_by, corrected_at,
        check_in_time, check_out_time, working_hours, status
      )
);