
-- Broaden the sales UPDATE policy: any approved sales user may update any order.
-- The orders_sales_locked_columns_check() trigger still prevents them from
-- touching procurement / supplier / payment / RTO / ownership columns.
DROP POLICY IF EXISTS "Sales can escalate own orders" ON public.orders;

CREATE POLICY "Sales can update orders"
ON public.orders
FOR UPDATE
TO public
USING (
  public.is_user_approved(auth.uid())
  AND public.has_role(auth.uid(), 'sales'::public.app_role)
)
WITH CHECK (
  public.is_user_approved(auth.uid())
  AND public.has_role(auth.uid(), 'sales'::public.app_role)
);

-- Broaden SELECT so sales can actually see the orders they may now edit.
DROP POLICY IF EXISTS "Users can view orders based on role" ON public.orders;

CREATE POLICY "Users can view orders based on role"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'sales'::public.app_role)
  )
);
