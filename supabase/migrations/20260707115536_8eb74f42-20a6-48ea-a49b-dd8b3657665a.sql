
-- companies: scope SELECT to CRM-relevant roles
DROP POLICY IF EXISTS "Approved users can view companies" ON public.companies;
CREATE POLICY "CRM roles can view companies"
ON public.companies FOR SELECT TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
  )
);

-- drone_repair_enquiries: add approval check on UPDATE
DROP POLICY IF EXISTS "Admin and supply chain can update enquiries" ON public.drone_repair_enquiries;
CREATE POLICY "Admin and supply chain can update enquiries"
ON public.drone_repair_enquiries FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
)
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

-- google_ads_leads: add approval check to sales SELECT/UPDATE
DROP POLICY IF EXISTS "Sales can view assigned google_ads_leads" ON public.google_ads_leads;
CREATE POLICY "Sales can view assigned google_ads_leads"
ON public.google_ads_leads FOR SELECT TO authenticated
USING (sales_person_id = auth.uid() AND is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Sales can update assigned google_ads_leads" ON public.google_ads_leads;
CREATE POLICY "Sales can update assigned google_ads_leads"
ON public.google_ads_leads FOR UPDATE TO authenticated
USING (sales_person_id = auth.uid() AND is_user_approved(auth.uid()))
WITH CHECK (sales_person_id = auth.uid() AND is_user_approved(auth.uid()));
