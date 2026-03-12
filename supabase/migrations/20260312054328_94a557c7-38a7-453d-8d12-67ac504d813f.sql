-- Allow approved users to view basic profile info of other approved users (for ticket assignment, meetings, etc.)
CREATE POLICY "Approved users can view approved profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND is_approved = true
);

-- Allow approved users to view roles of other users (for department-based filtering)
CREATE POLICY "Approved users can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
);