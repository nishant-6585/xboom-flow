
-- Allow employees to update their own attendance row (needed for checkout,
-- break start/end). Restrict which columns they can change via a guard trigger.

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
);

CREATE OR REPLACE FUNCTION public.guard_attendance_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- HR / Admin bypass — full edit rights.
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'hr');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Only allow self-updates from an approved user acting on their own row.
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.date         IS DISTINCT FROM OLD.date
     OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
     OR NEW.source       IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Only HR/Admin can modify this attendance field'
      USING ERRCODE = '42501';
  END IF;

  -- Prevent tampering with reconciliation / correction audit trail.
  IF NEW.reconciliation_status IS DISTINCT FROM OLD.reconciliation_status
     OR NEW.corrected_by       IS DISTINCT FROM OLD.corrected_by
     OR NEW.corrected_at       IS DISTINCT FROM OLD.corrected_at
     OR NEW.auto_checkout_applied IS DISTINCT FROM OLD.auto_checkout_applied
     OR NEW.is_provisional_checkout IS DISTINCT FROM OLD.is_provisional_checkout THEN
    RAISE EXCEPTION 'Only HR/Admin can modify reconciliation fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_attendance_self_update ON public.attendance_logs;
CREATE TRIGGER trg_guard_attendance_self_update
BEFORE UPDATE ON public.attendance_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_self_update();
