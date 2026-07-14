-- Broaden sales UPDATE/DELETE on payment_records so a salesperson can manage
-- pending/rejected payment records on any order attributed to them, not just
-- ones they personally submitted. Approved records remain admin/finance-only.

DROP POLICY IF EXISTS "Sales can update own rejected payment records" ON public.payment_records;
DROP POLICY IF EXISTS "Sales can delete own rejected payment records" ON public.payment_records;

CREATE POLICY "Sales can update payment records on their orders"
ON public.payment_records
FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND status = ANY (ARRAY['pending'::text, 'rejected'::text])
  AND (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_records.order_id
        AND o.sales_person_id = auth.uid()
    )
  )
)
WITH CHECK (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND status = 'pending'::text
  AND (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_records.order_id
        AND o.sales_person_id = auth.uid()
    )
  )
);

CREATE POLICY "Sales can delete rejected payment records on their orders"
ON public.payment_records
FOR DELETE
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND status = 'rejected'::text
  AND (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_records.order_id
        AND o.sales_person_id = auth.uid()
    )
  )
);