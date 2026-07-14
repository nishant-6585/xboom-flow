
DROP POLICY IF EXISTS "hr_finance_admin_select_payment_status" ON public.payroll_payment_status;
CREATE POLICY "hr_finance_admin_select_payment_status" ON public.payroll_payment_status
FOR SELECT USING (
  (is_hr_or_admin(auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'finance'::app_role))
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = payroll_payment_status.employee_id AND e.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "HR/Admin can view salary entries" ON public.salary_sheet_entries;
CREATE POLICY "HR/Admin can view salary entries" ON public.salary_sheet_entries
FOR SELECT USING (
  is_hr_or_admin(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = salary_sheet_entries.employee_id AND e.user_id = auth.uid())
  )
);
