DROP POLICY IF EXISTS "Approved business roles can view pricelist" ON public.pricelist;

CREATE POLICY "Sales managers can view pricelist"
ON public.pricelist
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Note: plain 'sales' role must use the public.pricelist_public view (no cost/margin columns).