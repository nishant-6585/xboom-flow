-- Narrow attendance_logs self-update guard: freeze only HR-controlled columns.
-- Previous version froze status/auto_checkout_*/is_provisional_checkout/source,
-- which blocked normal employee check-in/out (status changes) and any row
-- previously auto-checked-out by the cron.

CREATE OR REPLACE FUNCTION public.attendance_logs_self_update_check(
  _id uuid,
  _approved_by uuid,
  _approved_by_name text,
  _reconciliation_status text,
  _corrected_by uuid,
  _corrected_at timestamptz
) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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
    );
$$;

-- Drop the old 11-arg overload so the policy resolves to the new signature.
DROP POLICY IF EXISTS "Employees can update own attendance" ON public.attendance_logs;
DROP FUNCTION IF EXISTS public.attendance_logs_self_update_check(
  uuid, text, uuid, text, text, boolean, timestamptz, boolean, uuid, timestamptz, text
);

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
    id, approved_by, approved_by_name, reconciliation_status,
    corrected_by, corrected_at
  )
);