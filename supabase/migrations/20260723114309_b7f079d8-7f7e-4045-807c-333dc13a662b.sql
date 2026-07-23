
DROP POLICY IF EXISTS "Users see own or shared saved views" ON public.company_saved_views;
CREATE POLICY "Users see own or shared saved views"
ON public.company_saved_views
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    is_shared = true
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  )
);

DROP POLICY IF EXISTS "Approved internal users can view sales FAQs" ON public.sales_faqs;
CREATE POLICY "Sales roles can view sales FAQs"
ON public.sales_faqs
FOR SELECT
USING (
  is_user_approved(auth.uid())
  AND (
    asked_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_approved = true
      AND (
        has_role(auth.uid(), 'sales'::app_role)
        OR has_role(auth.uid(), 'sales_manager'::app_role)
        OR has_role(auth.uid(), 'supply_chain'::app_role)
      )
    )
  )
);

DROP POLICY IF EXISTS "Approved users view unavailability" ON public.sales_unavailability;
CREATE POLICY "Managers and owner view unavailability"
ON public.sales_unavailability
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR user_id = auth.uid()
  OR created_by = auth.uid()
);
