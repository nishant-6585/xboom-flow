DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;

CREATE POLICY "Admins and HR can insert user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role)) AND is_user_approved(auth.uid())
);