-- google_ads_leads: add is_user_approved check to role-based SELECT policies
DROP POLICY IF EXISTS "Sales managers can view google_ads_leads" ON public.google_ads_leads;
CREATE POLICY "Sales managers can view google_ads_leads"
ON public.google_ads_leads
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND (public.has_role(auth.uid(), 'sales_manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Supply chain can view google_ads_leads" ON public.google_ads_leads;
CREATE POLICY "Supply chain can view google_ads_leads"
ON public.google_ads_leads
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND public.has_role(auth.uid(), 'supply_chain'::app_role)
);

-- woocommerce_orders: add is_user_approved check to role-based SELECT policy
DROP POLICY IF EXISTS "Sales/Ops can view woocommerce orders" ON public.woocommerce_orders;
CREATE POLICY "Sales/Ops can view woocommerce orders"
ON public.woocommerce_orders
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  )
);