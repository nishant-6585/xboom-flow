
CREATE POLICY "HR users can update employee details"
ON public.employees
FOR UPDATE
TO authenticated
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));
