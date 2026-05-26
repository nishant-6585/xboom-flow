CREATE POLICY "leads_select_website_forms_authenticated"
ON public.leads
FOR SELECT
TO authenticated
USING (
  page_url ILIKE '%sell-your-used-drones%'
  OR page_url ILIKE '%rent-a-drone%'
);