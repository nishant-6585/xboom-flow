
-- Scope sales SELECT on orders to their own rows
DROP POLICY IF EXISTS "Users can view orders based on role" ON public.orders;
CREATE POLICY "Users can view orders based on role"
ON public.orders
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR (has_role(auth.uid(), 'sales'::app_role) AND sales_person_id = auth.uid())
  )
);

-- Scope sales SELECT on payment_records to their own orders / own submissions
DROP POLICY IF EXISTS "Users can view payment records for their orders" ON public.payment_records;
CREATE POLICY "Users can view payment records for their orders"
ON public.payment_records
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR (
      has_role(auth.uid(), 'sales'::app_role) AND (
        submitted_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = payment_records.order_id
            AND o.sales_person_id = auth.uid()
        )
      )
    )
  )
);
