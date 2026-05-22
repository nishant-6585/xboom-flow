
-- drone_repair_enquiries
DROP POLICY IF EXISTS "Authenticated users can view enquiries" ON public.drone_repair_enquiries;
CREATE POLICY "Sales-ops roles can view repair enquiries"
  ON public.drone_repair_enquiries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'supply_chain')
  );

-- shopify_orders
DROP POLICY IF EXISTS "Approved users can view shopify orders" ON public.shopify_orders;
CREATE POLICY "Sales-ops roles can view shopify orders"
  ON public.shopify_orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'supply_chain')
    OR public.has_role(auth.uid(), 'finance')
  );

-- missed_call_callbacks INSERT
DROP POLICY IF EXISTS "Users can create callbacks" ON public.missed_call_callbacks;
CREATE POLICY "Sales-ops roles can create callbacks"
  ON public.missed_call_callbacks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'supply_chain')
  );

-- portal_products SELECT
DROP POLICY IF EXISTS "portal_products: authenticated read active" ON public.portal_products;
CREATE POLICY "portal_products: sales-ops read active"
  ON public.portal_products
  FOR SELECT TO authenticated
  USING (
    active = true
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'sales_manager')
      OR public.has_role(auth.uid(), 'sales')
      OR public.has_role(auth.uid(), 'supply_chain')
      OR public.has_role(auth.uid(), 'finance')
    )
  );
