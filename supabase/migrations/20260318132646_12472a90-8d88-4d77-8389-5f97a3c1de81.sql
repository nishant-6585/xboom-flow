
-- Fix critical privilege escalation: drop the permissive self-insert policy
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

-- Replace with a restricted policy that only allows non-privileged initial role
CREATE POLICY "Users can insert initial non-privileged role only"
  ON public.user_roles FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() = user_id
    AND role NOT IN ('admin', 'hr', 'finance', 'supply_chain', 'sales_manager', 'it')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  );
