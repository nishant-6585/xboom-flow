
DROP POLICY IF EXISTS leads_select_website_forms_it_admin ON public.leads;
DROP POLICY IF EXISTS leads_select_qform_it_admin_only ON public.leads;

-- Buyback & Rent: admin OR Rohit only. Drone-repair: admin OR IT.
CREATE POLICY leads_select_website_forms_restricted ON public.leads
FOR SELECT
USING (
  (
    ((page_url ILIKE '%sell-your-used-drones%') OR (page_url ILIKE '%rent-a-drone%'))
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid() = '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid
    )
  )
  OR
  (
    (page_url ILIKE '%drone-repair%')
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'it'::app_role)
    )
  )
);

-- Restrictive policy: non-website-enquiry rows accessible by all (subject to other permissive policies);
-- website enquiry rows restricted as above.
CREATE POLICY leads_select_qform_restricted ON public.leads
AS RESTRICTIVE
FOR SELECT
USING (
  (page_url IS NULL)
  OR NOT (
    (page_url ILIKE '%sell-your-used-drones%')
    OR (page_url ILIKE '%rent-a-drone%')
    OR (page_url ILIKE '%drone-repair%')
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    ((page_url ILIKE '%sell-your-used-drones%') OR (page_url ILIKE '%rent-a-drone%'))
    AND auth.uid() = '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid
  )
  OR (
    (page_url ILIKE '%drone-repair%')
    AND has_role(auth.uid(), 'it'::app_role)
  )
);
