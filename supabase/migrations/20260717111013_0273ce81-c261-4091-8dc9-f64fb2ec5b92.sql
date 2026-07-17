DROP POLICY IF EXISTS leads_select_website_forms_restricted ON public.leads;

CREATE POLICY leads_select_website_forms_restricted
ON public.leads
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND (
    (
      (page_url ILIKE '%sell-your-used-drones%' OR page_url ILIKE '%rent-a-drone%' OR page_url ILIKE '%drone-repair%')
      AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    )
  )
);