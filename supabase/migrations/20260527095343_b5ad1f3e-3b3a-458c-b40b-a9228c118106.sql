DROP POLICY IF EXISTS leads_select_website_forms_sales_roles ON public.leads;

CREATE POLICY leads_select_website_forms_it_admin
ON public.leads
FOR SELECT
TO authenticated
USING (
  (
    page_url ILIKE '%sell-your-used-drones%'
    OR page_url ILIKE '%rent-a-drone%'
    OR page_url ILIKE '%drone-repair%'
  )
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'it'::public.app_role)
  )
);