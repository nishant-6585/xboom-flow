
-- Add self-exclusion to HR/finance blanket policies so HR/finance staff cannot
-- self-approve attendance, self-approve leave, or self-mark payroll payment.

-- attendance_logs: HR ALL policy self-exclusion
DROP POLICY IF EXISTS "HR can manage all attendance" ON public.attendance_logs;
CREATE POLICY "HR can manage all attendance" ON public.attendance_logs
  AS PERMISSIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'hr'::app_role)
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- leave_requests: HR ALL policy self-exclusion
DROP POLICY IF EXISTS "HR can manage all leave requests" ON public.leave_requests;
CREATE POLICY "HR can manage all leave requests" ON public.leave_requests
  AS PERMISSIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'hr'::app_role)
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- payroll_payment_status: finance/HR/admin cannot write rows for own employee_id
DROP POLICY IF EXISTS finance_admin_insert_payment_status ON public.payroll_payment_status;
CREATE POLICY finance_admin_insert_payment_status ON public.payroll_payment_status
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (
      is_hr_or_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'finance'::app_role
      )
    )
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS finance_admin_update_payment_status ON public.payroll_payment_status;
CREATE POLICY finance_admin_update_payment_status ON public.payroll_payment_status
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = ANY (ARRAY['finance'::app_role,'admin'::app_role])
    )
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = ANY (ARRAY['finance'::app_role,'admin'::app_role])
    )
    AND employee_id NOT IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );
