DROP POLICY IF EXISTS "Staff can read attribution log" ON public.sales_attribution_log;

CREATE POLICY "Internal roles can read attribution log"
ON public.sales_attribution_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
);