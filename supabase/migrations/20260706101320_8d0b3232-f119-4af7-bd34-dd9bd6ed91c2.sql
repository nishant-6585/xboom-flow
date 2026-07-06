
-- call_logs: sales role can only update own rows
DROP POLICY IF EXISTS "Sales can update assigned call logs" ON public.call_logs;
CREATE POLICY "Sales can update assigned call logs"
ON public.call_logs
FOR UPDATE
USING (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR sales_person_id = auth.uid()
  )
)
WITH CHECK (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR sales_person_id = auth.uid()
  )
);

-- email_leads: scope sales role to own assignments
DROP POLICY IF EXISTS "Authorized roles can update email leads" ON public.email_leads;
CREATE POLICY "Authorized roles can update email leads"
ON public.email_leads
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR (
    has_role(auth.uid(), 'sales'::app_role)
    AND (assigned_to = auth.uid() OR sales_person_id = auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR (
    has_role(auth.uid(), 'sales'::app_role)
    AND (assigned_to = auth.uid() OR sales_person_id = auth.uid())
  )
);

-- leads: scope sales role to own assignments
DROP POLICY IF EXISTS "leads_update_sales_admin" ON public.leads;
CREATE POLICY "leads_update_sales_admin"
ON public.leads
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR (has_role(auth.uid(), 'sales'::app_role) AND assigned_to = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR (has_role(auth.uid(), 'sales'::app_role) AND assigned_to = auth.uid())
);
