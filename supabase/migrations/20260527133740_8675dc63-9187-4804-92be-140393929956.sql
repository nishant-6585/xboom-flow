
-- Allow sales submitters to update and delete their own rejected payment records (to fix & resubmit)
DROP POLICY IF EXISTS "Sales can update own rejected payment records" ON public.payment_records;
CREATE POLICY "Sales can update own rejected payment records"
ON public.payment_records
FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND submitted_by = auth.uid()
  AND status IN ('pending'::text, 'rejected'::text)
)
WITH CHECK (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND submitted_by = auth.uid()
  AND status = 'pending'::text
);

DROP POLICY IF EXISTS "Sales can delete own pending payment records" ON public.payment_records;
CREATE POLICY "Sales can delete own pending or rejected payment records"
ON public.payment_records
FOR DELETE
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND submitted_by = auth.uid()
  AND status IN ('pending'::text, 'rejected'::text)
);
