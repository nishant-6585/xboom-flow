
-- 1. Audit table for bank detail changes
CREATE TABLE IF NOT EXISTS public.employee_bank_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  changed_by uuid,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.employee_bank_audit_log TO authenticated;
GRANT ALL ON public.employee_bank_audit_log TO service_role;

ALTER TABLE public.employee_bank_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR/Admin/Finance can view bank audit log"
  ON public.employee_bank_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'finance')
  );

CREATE INDEX IF NOT EXISTS employee_bank_audit_log_employee_idx
  ON public.employee_bank_audit_log(employee_id, created_at DESC);

-- 2. Guard trigger: block self-mutation of sensitive fields
CREATE OR REPLACE FUNCTION public.guard_employees_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  is_privileged boolean;
BEGIN
  -- Service-role / internal calls (no JWT) bypass the check entirely.
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged :=
    public.has_role(actor, 'admin')
    OR public.has_role(actor, 'hr');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Non-privileged actors: block changes to sensitive columns.
  IF NEW.monthly_salary       IS DISTINCT FROM OLD.monthly_salary       THEN
    RAISE EXCEPTION 'Not authorized to modify monthly_salary' USING ERRCODE = '42501';
  END IF;
  IF NEW.role                 IS DISTINCT FROM OLD.role                 THEN
    RAISE EXCEPTION 'Not authorized to modify role' USING ERRCODE = '42501';
  END IF;
  IF NEW.department           IS DISTINCT FROM OLD.department           THEN
    RAISE EXCEPTION 'Not authorized to modify department' USING ERRCODE = '42501';
  END IF;
  IF NEW.manager_id           IS DISTINCT FROM OLD.manager_id           THEN
    RAISE EXCEPTION 'Not authorized to modify manager_id' USING ERRCODE = '42501';
  END IF;
  IF NEW.employment_status    IS DISTINCT FROM OLD.employment_status    THEN
    RAISE EXCEPTION 'Not authorized to modify employment_status' USING ERRCODE = '42501';
  END IF;
  IF NEW.joining_date         IS DISTINCT FROM OLD.joining_date         THEN
    RAISE EXCEPTION 'Not authorized to modify joining_date' USING ERRCODE = '42501';
  END IF;
  IF NEW.exit_date            IS DISTINCT FROM OLD.exit_date            THEN
    RAISE EXCEPTION 'Not authorized to modify exit_date' USING ERRCODE = '42501';
  END IF;
  IF NEW.designation          IS DISTINCT FROM OLD.designation          THEN
    RAISE EXCEPTION 'Not authorized to modify designation' USING ERRCODE = '42501';
  END IF;
  IF NEW.employee_number      IS DISTINCT FROM OLD.employee_number      THEN
    RAISE EXCEPTION 'Not authorized to modify employee_number' USING ERRCODE = '42501';
  END IF;
  IF NEW.employee_type        IS DISTINCT FROM OLD.employee_type        THEN
    RAISE EXCEPTION 'Not authorized to modify employee_type' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_active            IS DISTINCT FROM OLD.is_active            THEN
    RAISE EXCEPTION 'Not authorized to modify is_active' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id              IS DISTINCT FROM OLD.user_id              THEN
    RAISE EXCEPTION 'Not authorized to modify user_id' USING ERRCODE = '42501';
  END IF;
  IF NEW.weekly_hours_target      IS DISTINCT FROM OLD.weekly_hours_target      THEN
    RAISE EXCEPTION 'Not authorized to modify weekly_hours_target' USING ERRCODE = '42501';
  END IF;
  IF NEW.monthly_attendance_target IS DISTINCT FROM OLD.monthly_attendance_target THEN
    RAISE EXCEPTION 'Not authorized to modify monthly_attendance_target' USING ERRCODE = '42501';
  END IF;
  IF NEW.shift_type           IS DISTINCT FROM OLD.shift_type           THEN
    RAISE EXCEPTION 'Not authorized to modify shift_type' USING ERRCODE = '42501';
  END IF;
  IF NEW.shift_start_time     IS DISTINCT FROM OLD.shift_start_time     THEN
    RAISE EXCEPTION 'Not authorized to modify shift_start_time' USING ERRCODE = '42501';
  END IF;
  IF NEW.shift_end_time       IS DISTINCT FROM OLD.shift_end_time       THEN
    RAISE EXCEPTION 'Not authorized to modify shift_end_time' USING ERRCODE = '42501';
  END IF;
  IF NEW.work_location        IS DISTINCT FROM OLD.work_location        THEN
    RAISE EXCEPTION 'Not authorized to modify work_location' USING ERRCODE = '42501';
  END IF;
  IF NEW.tax_regime           IS DISTINCT FROM OLD.tax_regime           THEN
    RAISE EXCEPTION 'Not authorized to modify tax_regime' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employees_sensitive_updates ON public.employees;
CREATE TRIGGER trg_guard_employees_sensitive_updates
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_employees_sensitive_updates();

-- 3. Audit + HR notification on bank detail changes
CREATE OR REPLACE FUNCTION public.audit_employee_bank_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  bank_changed boolean := NEW.bank_account IS DISTINCT FROM OLD.bank_account;
  ifsc_changed boolean := NEW.ifsc_code    IS DISTINCT FROM OLD.ifsc_code;
BEGIN
  IF bank_changed THEN
    INSERT INTO public.employee_bank_audit_log
      (employee_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, actor, 'bank_account', OLD.bank_account, NEW.bank_account);
  END IF;

  IF ifsc_changed THEN
    INSERT INTO public.employee_bank_audit_log
      (employee_id, changed_by, field_name, old_value, new_value)
    VALUES
      (NEW.id, actor, 'ifsc_code', OLD.ifsc_code, NEW.ifsc_code);
  END IF;

  IF bank_changed OR ifsc_changed THEN
    INSERT INTO public.notifications (type, title, message, target_role)
    VALUES (
      'employee_bank_change',
      'Employee bank details changed',
      format(
        'Bank details updated for %s (id %s). Review the bank audit log before the next payroll run.',
        COALESCE(NEW.name, 'employee'),
        NEW.id
      ),
      'hr'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_employee_bank_changes ON public.employees;
CREATE TRIGGER trg_audit_employee_bank_changes
  AFTER UPDATE OF bank_account, ifsc_code ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_employee_bank_changes();
