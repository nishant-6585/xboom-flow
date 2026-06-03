-- Prevent self-assignment of 'support' role (privilege escalation fix)
DROP POLICY IF EXISTS "Users can insert initial non-privileged role only" ON public.user_roles;

CREATE POLICY "Users can insert initial non-privileged role only"
ON public.user_roles
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND role <> ALL (ARRAY['admin'::app_role, 'hr'::app_role, 'finance'::app_role, 'supply_chain'::app_role, 'sales_manager'::app_role, 'it'::app_role, 'support'::app_role])
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);
