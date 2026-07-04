
-- 1) Pin search_path on 4 user-owned functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 2) attendance_logs: remove ALL-self-write; keep SELECT + INSERT only
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.attendance_logs;
CREATE POLICY "Users can insert own attendance"
  ON public.attendance_logs
  FOR INSERT
  WITH CHECK (
    (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
    AND public.is_user_approved(auth.uid())
  );
-- SELECT policy "Employees can view own attendance" already exists; UPDATE/DELETE now restricted to HR/Admin.

-- 3) employees: enforce that self-update cannot change sensitive columns via trigger
CREATE OR REPLACE FUNCTION public.prevent_employee_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HR / Admin bypass
  IF public.is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Only enforce when the row belongs to the caller (self-update path)
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NEW.monthly_salary   IS DISTINCT FROM OLD.monthly_salary
     OR NEW.bank_account  IS DISTINCT FROM OLD.bank_account
     OR NEW.ifsc_code     IS DISTINCT FROM OLD.ifsc_code
     OR NEW.pan_number    IS DISTINCT FROM OLD.pan_number
     OR NEW.designation   IS DISTINCT FROM OLD.designation
     OR NEW.department    IS DISTINCT FROM OLD.department
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.is_active     IS DISTINCT FROM OLD.is_active
     OR NEW.user_id       IS DISTINCT FROM OLD.user_id
     OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
     OR NEW.date_of_joining IS DISTINCT FROM OLD.date_of_joining
     OR NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id
  THEN
    RAISE EXCEPTION 'Employees cannot modify compensation, banking, employment, or org fields on their own record';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_employee_self_privilege_escalation ON public.employees;
CREATE TRIGGER trg_prevent_employee_self_privilege_escalation
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_self_privilege_escalation();

-- 4) expenses: block self-approval via trigger
CREATE OR REPLACE FUNCTION public.prevent_expense_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin / Finance bypass
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'finance'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only self-update path (creator editing their own expense)
  IF NEW.created_by IS DISTINCT FROM (auth.uid())::text THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending expenses can be edited by the creator';
  END IF;

  IF NEW.status       IS DISTINCT FROM OLD.status
     OR NEW.approved_by      IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_by_name IS DISTINCT FROM OLD.approved_by_name
     OR NEW.approved_at      IS DISTINCT FROM OLD.approved_at
     OR NEW.paid_from_petty_cash IS DISTINCT FROM OLD.paid_from_petty_cash
     OR NEW.amount_paid      IS DISTINCT FROM OLD.amount_paid
  THEN
    RAISE EXCEPTION 'Only admin/finance can change approval or payment fields on expenses';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_expense_self_approval ON public.expenses;
CREATE TRIGGER trg_prevent_expense_self_approval
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_expense_self_approval();

-- 5) leave_requests: block self-approval via trigger
CREATE OR REPLACE FUNCTION public.prevent_leave_request_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owns boolean;
BEGIN
  -- HR / Admin bypass
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = NEW.employee_id AND user_id = auth.uid()
  ) INTO v_owns;

  IF NOT v_owns THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('draft','pending') THEN
    RAISE EXCEPTION 'Leave requests can only be edited while draft or pending';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('draft','pending','cancelled')
  THEN
    RAISE EXCEPTION 'Only HR/Admin can approve or reject leave requests';
  END IF;

  IF NEW.approver_id   IS DISTINCT FROM OLD.approver_id
     OR NEW.approver_name IS DISTINCT FROM OLD.approver_name
     OR NEW.approved_at   IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN
    RAISE EXCEPTION 'Only HR/Admin can set approver or rejection fields on leave requests';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_leave_request_self_approval ON public.leave_requests;
CREATE TRIGGER trg_prevent_leave_request_self_approval
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_leave_request_self_approval();
