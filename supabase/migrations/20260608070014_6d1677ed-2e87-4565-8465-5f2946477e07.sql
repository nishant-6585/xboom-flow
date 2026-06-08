
DROP POLICY IF EXISTS "Employees can view active process docs" ON public.hr_process_documents;

CREATE POLICY "Internal roles can view active process docs"
ON public.hr_process_documents
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'it'::app_role)
    OR has_role(auth.uid(), 'marketing'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  )
);

DROP POLICY IF EXISTS "leads_select_qform_restricted" ON public.leads;
DROP POLICY IF EXISTS "leads_select_website_forms_restricted" ON public.leads;

CREATE POLICY "leads_select_website_forms_restricted"
ON public.leads
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND (
    (
      ((page_url ILIKE '%sell-your-used-drones%') OR (page_url ILIKE '%rent-a-drone%'))
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    )
    OR (
      (page_url ILIKE '%drone-repair%')
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it'::app_role))
    )
  )
);
