DROP POLICY IF EXISTS "Admins and HR can insert user roles" ON public.user_roles;

CREATE POLICY "Admins can insert any user role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND is_user_approved(auth.uid())
);

CREATE POLICY "HR can insert non-privileged user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'hr'::app_role)
  AND is_user_approved(auth.uid())
  AND role NOT IN ('admin'::app_role, 'finance'::app_role, 'supply_chain'::app_role)
);