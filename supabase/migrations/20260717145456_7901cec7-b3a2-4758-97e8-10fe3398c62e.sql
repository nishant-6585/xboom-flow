CREATE POLICY "Users can view role-targeted notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  target_role IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = notifications.target_role
  )
  AND (user_id IS NULL OR user_id = auth.uid())
);