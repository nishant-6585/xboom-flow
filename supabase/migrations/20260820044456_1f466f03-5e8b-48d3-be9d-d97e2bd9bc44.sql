DROP POLICY IF EXISTS "Users can view orders based on role" ON public.orders;

CREATE POLICY "Users can view orders based on role"
ON public.orders
FOR SELECT
USING (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR (
      has_role(auth.uid(), 'sales'::app_role)
      AND (
        sales_person_id = auth.uid()
        OR (
          external_id IS NOT NULL
          AND (
            sales_person_id IS NULL
            OR sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid
            OR source = 'website'
          )
        )
      )
    )
  )
);