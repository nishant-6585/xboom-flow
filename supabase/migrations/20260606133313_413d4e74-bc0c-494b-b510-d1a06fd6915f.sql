
-- 1. Remove self-assign privileged role policy
DROP POLICY IF EXISTS "Users can insert initial non-privileged role only" ON public.user_roles;

-- 2. Replace hardcoded UUID in leads policies with role-based check (supply_chain)
DROP POLICY IF EXISTS "leads_select_qform_restricted" ON public.leads;
DROP POLICY IF EXISTS "leads_select_website_forms_restricted" ON public.leads;

CREATE POLICY "leads_select_qform_restricted"
ON public.leads
FOR SELECT
USING (
  (page_url IS NULL)
  OR (NOT (
        (page_url ILIKE '%sell-your-used-drones%')
     OR (page_url ILIKE '%rent-a-drone%')
     OR (page_url ILIKE '%drone-repair%')
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
        ((page_url ILIKE '%sell-your-used-drones%') OR (page_url ILIKE '%rent-a-drone%'))
        AND has_role(auth.uid(), 'supply_chain'::app_role)
     )
  OR (
        (page_url ILIKE '%drone-repair%')
        AND has_role(auth.uid(), 'it'::app_role)
     )
);

CREATE POLICY "leads_select_website_forms_restricted"
ON public.leads
FOR SELECT
USING (
  (
    ((page_url ILIKE '%sell-your-used-drones%') OR (page_url ILIKE '%rent-a-drone%'))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
  )
  OR (
    (page_url ILIKE '%drone-repair%')
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'it'::app_role))
  )
);

-- 3. Tighten hr-process-docs storage read policy
DROP POLICY IF EXISTS "Authenticated can read hr-process-docs" ON storage.objects;

CREATE POLICY "Approved internal can read hr-process-docs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'hr-process-docs'
  AND is_user_approved(auth.uid())
  AND (
       has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'it'::app_role)
    OR has_role(auth.uid(), 'marketing'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
  )
);

-- 4. Drop visitor PII columns from form_submissions
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS ip_address;
ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS user_agent;
