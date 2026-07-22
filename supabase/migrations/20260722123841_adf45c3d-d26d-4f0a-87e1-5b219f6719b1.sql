DROP POLICY IF EXISTS "Sales can update orders" ON public.orders;
CREATE POLICY "Sales can update orders" ON public.orders
  FOR UPDATE
  USING (
    is_user_approved(auth.uid())
    AND has_role(auth.uid(), 'sales'::app_role)
    AND sales_person_id = auth.uid()
  )
  WITH CHECK (
    is_user_approved(auth.uid())
    AND has_role(auth.uid(), 'sales'::app_role)
    AND sales_person_id = auth.uid()
  );