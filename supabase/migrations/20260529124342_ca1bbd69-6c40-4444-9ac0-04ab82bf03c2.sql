CREATE POLICY "Sales can update assigned call logs"
ON public.call_logs
FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'sales'::app_role)
    OR sales_person_id = auth.uid()
  )
)
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'sales'::app_role)
    OR sales_person_id = auth.uid()
  )
);