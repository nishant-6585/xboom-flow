
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Approved users can view attendance" ON public.attendance_logs;

-- Employees can only view their own attendance logs
CREATE POLICY "Employees can view own attendance"
ON public.attendance_logs
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
  AND is_user_approved(auth.uid())
);

-- HR and Admin can view all attendance logs
CREATE POLICY "HR and Admin can view all attendance"
ON public.attendance_logs
FOR SELECT
USING (
  is_hr_or_admin(auth.uid())
);
