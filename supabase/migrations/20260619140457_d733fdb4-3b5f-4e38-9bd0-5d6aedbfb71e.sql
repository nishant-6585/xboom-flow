-- 1) gmail_integrations: restrict direct SELECT to the owning user only.
DROP POLICY IF EXISTS "Admins can select gmail integrations (with tokens)" ON public.gmail_integrations;
CREATE POLICY "Owners can select their gmail integrations"
ON public.gmail_integrations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2) myoperator_config: remove broad admin access; only service_role may touch the table directly.
DROP POLICY IF EXISTS "Admins can manage myoperator config" ON public.myoperator_config;
CREATE POLICY "Service role manages myoperator config"
ON public.myoperator_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3) invoice_email_log: tighten INSERT to internal roles (mirrors SELECT scope); service_role still works.
DROP POLICY IF EXISTS "Authenticated can insert invoice email logs" ON public.invoice_email_log;
CREATE POLICY "Internal roles can insert invoice email logs"
ON public.invoice_email_log
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
);