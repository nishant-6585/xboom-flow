-- FIX 1: Convert security definer views to security invoker
ALTER VIEW public.daily_performance SET (security_invoker = on);
ALTER VIEW public.campaign_performance SET (security_invoker = on);

-- FIX 2: Restrict employees table SELECT to HR/admin + own record
DROP POLICY IF EXISTS "Approved users can view employees" ON public.employees;

CREATE POLICY "Users can view own employee record"
ON public.employees FOR SELECT
USING (
  user_id = auth.uid() AND is_user_approved(auth.uid())
);

CREATE POLICY "HR can view all employees"
ON public.employees FOR SELECT
USING (
  is_hr_or_admin(auth.uid()) AND is_user_approved(auth.uid())
);

-- Create employees_directory view for general lookups (non-sensitive fields only)
CREATE OR REPLACE VIEW public.employees_directory
WITH (security_invoker = on)
AS
SELECT 
  id, user_id, name, employee_number, department, designation, role,
  work_location, is_active, joining_date, employee_type, employment_status,
  phone, xboom_email, gender, state, city, shift_type, shift_start_time,
  shift_end_time, weekly_hours_target, monthly_attendance_target,
  manager_id, exit_date
FROM public.employees;

GRANT SELECT ON public.employees_directory TO authenticated;
GRANT SELECT ON public.employees_directory TO anon;