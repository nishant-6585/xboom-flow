
-- Fix Admin policy: add WITH CHECK clause for write operations
DROP POLICY IF EXISTS "Admins can manage all attendance" ON public.attendance_logs;
CREATE POLICY "Admins can manage all attendance" ON public.attendance_logs
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Fix employee self-management policy: add WITH CHECK clause
DROP POLICY IF EXISTS "Users can manage their own attendance" ON public.attendance_logs;
CREATE POLICY "Users can manage their own attendance" ON public.attendance_logs
FOR ALL TO authenticated
USING (
  (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  AND public.is_user_approved(auth.uid())
)
WITH CHECK (
  (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  AND public.is_user_approved(auth.uid())
);
