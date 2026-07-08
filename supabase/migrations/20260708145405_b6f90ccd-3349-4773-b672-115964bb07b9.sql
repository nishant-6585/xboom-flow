
DROP POLICY IF EXISTS "Users can view payment records for their orders" ON public.payment_records;

CREATE POLICY "Users can view payment records for their orders"
ON public.payment_records
FOR SELECT
TO authenticated
USING (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supply_chain'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'sales'::public.app_role)
  )
);
