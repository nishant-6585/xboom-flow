-- Allow admins to delete profiles (for denying registrations)
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
USING (public.has_role(auth.uid(), 'admin') AND public.is_user_approved(auth.uid()));

-- Also need to allow admins to delete user roles
CREATE POLICY "Admins can delete user roles"
ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(), 'admin') AND public.is_user_approved(auth.uid()));