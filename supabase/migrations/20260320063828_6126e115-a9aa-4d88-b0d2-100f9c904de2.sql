
-- 1. attendance_logs: HR can manage all attendance (currently admin-only for ALL)
CREATE POLICY "HR can manage all attendance"
ON public.attendance_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'hr'::app_role))
WITH CHECK (has_role(auth.uid(), 'hr'::app_role));

-- 2. employee_assets: HR can manage all assets (currently admin-only)
CREATE POLICY "HR can manage all assets"
ON public.employee_assets
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'hr'::app_role))
WITH CHECK (has_role(auth.uid(), 'hr'::app_role));

-- 3. employees: HR can INSERT and DELETE employees (already has UPDATE from previous fix)
CREATE POLICY "HR can insert employees"
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (is_hr_or_admin(auth.uid()));

CREATE POLICY "HR can delete employees"
ON public.employees
FOR DELETE
TO authenticated
USING (is_hr_or_admin(auth.uid()));

-- 4. leave_requests: HR can manage all leave requests (currently admin-only)
CREATE POLICY "HR can manage all leave requests"
ON public.leave_requests
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'hr'::app_role))
WITH CHECK (has_role(auth.uid(), 'hr'::app_role));

-- 5. trainings: HR can delete trainings (currently admin-only for DELETE)
CREATE POLICY "HR can delete trainings"
ON public.trainings
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'hr'::app_role));

-- 6. attendance_notifications_log: HR can insert nudge logs
CREATE POLICY "HR and admin can insert nudge logs"
ON public.attendance_notifications_log
FOR INSERT
TO authenticated
WITH CHECK (is_hr_or_admin(auth.uid()));
