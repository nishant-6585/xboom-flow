
DROP POLICY IF EXISTS "Prospects insert" ON public.prospects;
CREATE POLICY "Prospects insert"
ON public.prospects
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated users can create FAQs" ON public.sales_faqs;
CREATE POLICY "Authenticated users can create FAQs"
ON public.sales_faqs
FOR INSERT
WITH CHECK (
  asked_by = auth.uid()
  AND is_user_approved(auth.uid())
);
