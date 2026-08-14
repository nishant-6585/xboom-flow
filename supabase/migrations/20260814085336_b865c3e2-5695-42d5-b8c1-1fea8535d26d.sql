DROP POLICY "Authorized roles can insert email leads" ON public.email_leads;

CREATE POLICY "Authorized roles can insert email leads"
ON public.email_leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
  )
);