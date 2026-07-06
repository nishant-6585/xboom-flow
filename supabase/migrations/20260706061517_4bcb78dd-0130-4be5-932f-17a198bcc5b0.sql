
-- ============================================================================
-- Employees: block self-update of sensitive fields at the RLS layer.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.employees_self_update_check(
  _id uuid,
  _monthly_salary numeric,
  _bank_account text,
  _ifsc_code text,
  _pan_number text,
  _employment_status employment_status,
  _is_active boolean,
  _department text,
  _manager_id uuid,
  _designation text,
  _joining_date date,
  _exit_date date,
  _employee_number text,
  _employee_type text,
  _tax_regime text,
  _role text,
  _shift_type text,
  _shift_start_time time,
  _shift_end_time time,
  _xboom_email text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_hr_or_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = _id
          AND e.monthly_salary    IS NOT DISTINCT FROM _monthly_salary
          AND e.bank_account      IS NOT DISTINCT FROM _bank_account
          AND e.ifsc_code         IS NOT DISTINCT FROM _ifsc_code
          AND e.pan_number        IS NOT DISTINCT FROM _pan_number
          AND e.employment_status IS NOT DISTINCT FROM _employment_status
          AND e.is_active         IS NOT DISTINCT FROM _is_active
          AND e.department        IS NOT DISTINCT FROM _department
          AND e.manager_id        IS NOT DISTINCT FROM _manager_id
          AND e.designation       IS NOT DISTINCT FROM _designation
          AND e.joining_date      IS NOT DISTINCT FROM _joining_date
          AND e.exit_date         IS NOT DISTINCT FROM _exit_date
          AND e.employee_number   IS NOT DISTINCT FROM _employee_number
          AND e.employee_type     IS NOT DISTINCT FROM _employee_type
          AND e.tax_regime        IS NOT DISTINCT FROM _tax_regime
          AND e.role              IS NOT DISTINCT FROM _role
          AND e.shift_type        IS NOT DISTINCT FROM _shift_type
          AND e.shift_start_time  IS NOT DISTINCT FROM _shift_start_time
          AND e.shift_end_time    IS NOT DISTINCT FROM _shift_end_time
          AND e.xboom_email       IS NOT DISTINCT FROM _xboom_email
      );
$$;

REVOKE ALL ON FUNCTION public.employees_self_update_check(
  uuid, numeric, text, text, text, employment_status, boolean, text, uuid, text,
  date, date, text, text, text, text, text, time, time, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.employees_self_update_check(
  uuid, numeric, text, text, text, employment_status, boolean, text, uuid, text,
  date, date, text, text, text, text, text, time, time, text
) TO authenticated;

DROP POLICY IF EXISTS "Users can update their own employee record" ON public.employees;
CREATE POLICY "Users can update their own employee record"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_user_approved(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND is_user_approved(auth.uid())
    AND public.employees_self_update_check(
      id, monthly_salary, bank_account, ifsc_code, pan_number, employment_status,
      is_active, department, manager_id, designation, joining_date, exit_date,
      employee_number, employee_type, tax_regime, role, shift_type,
      shift_start_time, shift_end_time, xboom_email
    )
  );

-- ============================================================================
-- Leave requests: block employees from self-approving via the RLS layer.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.leave_request_self_update_check(
  _id uuid,
  _status text,
  _approver_id uuid,
  _approver_name text,
  _approved_rejected_at timestamptz,
  _is_hr_applied boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_hr_or_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.leave_requests lr
        WHERE lr.id = _id
          AND lr.status               IS NOT DISTINCT FROM _status
          AND lr.approver_id          IS NOT DISTINCT FROM _approver_id
          AND lr.approver_name        IS NOT DISTINCT FROM _approver_name
          AND lr.approved_rejected_at IS NOT DISTINCT FROM _approved_rejected_at
          AND lr.is_hr_applied        IS NOT DISTINCT FROM _is_hr_applied
      )
      -- Employees may still transition draft -> submitted or cancel their own request.
      OR (
        _status IN ('draft','submitted','cancelled')
        AND _approver_id IS NULL
        AND _approver_name IS NULL
        AND _approved_rejected_at IS NULL
        AND _is_hr_applied IS FALSE
      );
$$;

REVOKE ALL ON FUNCTION public.leave_request_self_update_check(
  uuid, text, uuid, text, timestamptz, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_request_self_update_check(
  uuid, text, uuid, text, timestamptz, boolean
) TO authenticated;

-- The old policy was FOR ALL — split so INSERT/SELECT/DELETE keep working
-- for the owner, while UPDATE gets a column-aware WITH CHECK.
DROP POLICY IF EXISTS "Users can manage their own leave requests" ON public.leave_requests;

CREATE POLICY "Users can view their own leave requests"
  ON public.leave_requests
  FOR SELECT
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
  );

CREATE POLICY "Users can create their own leave requests"
  ON public.leave_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
    AND status IN ('draft','submitted')
    AND approver_id IS NULL
    AND approved_rejected_at IS NULL
    AND is_hr_applied IS FALSE
  );

CREATE POLICY "Users can update their own leave requests"
  ON public.leave_requests
  FOR UPDATE
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
    AND public.leave_request_self_update_check(
      id, status, approver_id, approver_name, approved_rejected_at, is_hr_applied
    )
  );

CREATE POLICY "Users can delete their own leave requests"
  ON public.leave_requests
  FOR DELETE
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    AND is_user_approved(auth.uid())
    AND status IN ('draft','submitted','cancelled')
  );

-- ============================================================================
-- Sales FAQs: add missing WITH CHECK so authors can't self-approve.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sales_faq_self_update_check(
  _id uuid,
  _is_approved boolean,
  _approved_by uuid,
  _approved_by_name text,
  _approved_at timestamptz,
  _answered_by uuid,
  _answered_by_name text,
  _answered_at timestamptz,
  _is_pinned boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.sales_faqs f
        WHERE f.id = _id
          AND f.is_approved      IS NOT DISTINCT FROM _is_approved
          AND f.approved_by      IS NOT DISTINCT FROM _approved_by
          AND f.approved_by_name IS NOT DISTINCT FROM _approved_by_name
          AND f.approved_at      IS NOT DISTINCT FROM _approved_at
          AND f.answered_by      IS NOT DISTINCT FROM _answered_by
          AND f.answered_by_name IS NOT DISTINCT FROM _answered_by_name
          AND f.answered_at      IS NOT DISTINCT FROM _answered_at
          AND f.is_pinned        IS NOT DISTINCT FROM _is_pinned
      );
$$;

REVOKE ALL ON FUNCTION public.sales_faq_self_update_check(
  uuid, boolean, uuid, text, timestamptz, uuid, text, timestamptz, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_faq_self_update_check(
  uuid, boolean, uuid, text, timestamptz, uuid, text, timestamptz, boolean
) TO authenticated;

DROP POLICY IF EXISTS "Users can update their own questions or admins can update all" ON public.sales_faqs;
CREATE POLICY "Users can update their own questions or admins can update all"
  ON public.sales_faqs
  FOR UPDATE
  TO authenticated
  USING (asked_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (
    (asked_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
    AND public.sales_faq_self_update_check(
      id, is_approved, approved_by, approved_by_name, approved_at,
      answered_by, answered_by_name, answered_at, is_pinned
    )
  );
