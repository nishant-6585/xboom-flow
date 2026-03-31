
-- Update gmail_integrations RLS: replace marketing with sales_manager
DROP POLICY IF EXISTS "Admin and marketing can manage gmail integrations" ON public.gmail_integrations;
CREATE POLICY "Admin and sales_manager can manage gmail integrations"
ON public.gmail_integrations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role));

-- Update gmail_sync_logs RLS: replace marketing with sales_manager
DROP POLICY IF EXISTS "Admin and marketing can view sync logs" ON public.gmail_sync_logs;
CREATE POLICY "Admin and sales_manager can view sync logs"
ON public.gmail_sync_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role));
