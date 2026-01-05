-- Add UPDATE policy for admins on user_roles table
CREATE POLICY "Admins can update user roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) AND is_user_approved(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND is_user_approved(auth.uid()));