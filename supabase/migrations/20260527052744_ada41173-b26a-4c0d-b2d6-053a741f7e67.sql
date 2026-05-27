-- 1) gmail_integrations: scope UPDATE/DELETE for sales_manager to own row
DROP POLICY IF EXISTS "Admin and sales_manager can update gmail integrations" ON public.gmail_integrations;
DROP POLICY IF EXISTS "Admin and sales_manager can delete gmail integrations" ON public.gmail_integrations;

CREATE POLICY "Admin or owning sales_manager can update gmail integrations"
ON public.gmail_integrations
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'sales_manager'::app_role) AND user_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'sales_manager'::app_role) AND user_id = auth.uid())
);

CREATE POLICY "Admin or owning sales_manager can delete gmail integrations"
ON public.gmail_integrations
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'sales_manager'::app_role) AND user_id = auth.uid())
);

-- 2) leads: restrict website-form SELECT policy to admin/sales/sales_manager
DROP POLICY IF EXISTS "leads_select_website_forms_authenticated" ON public.leads;

CREATE POLICY "leads_select_website_forms_sales_roles"
ON public.leads
FOR SELECT
TO authenticated
USING (
  ((page_url ILIKE '%sell-your-used-drones%') OR (page_url ILIKE '%rent-a-drone%'))
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  )
);