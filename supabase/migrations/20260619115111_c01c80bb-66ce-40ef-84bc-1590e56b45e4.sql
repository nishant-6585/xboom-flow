
DROP POLICY IF EXISTS "Authenticated can view invoice email logs" ON public.invoice_email_log;
CREATE POLICY "Finance and admin can view invoice email logs"
ON public.invoice_email_log FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
  OR public.has_role(auth.uid(), 'supply_chain'::app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view proforma rule audit" ON public.proforma_rule_audit;
CREATE POLICY "Privileged roles can view proforma rule audit"
ON public.proforma_rule_audit FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
  OR public.has_role(auth.uid(), 'supply_chain'::app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::app_role)
);
