-- Allow sales users to update order items for their own orders
-- (UI already exposes inline edit; without this policy, updates are silently rejected by RLS)

CREATE POLICY "Sales can update own order items"
ON public.order_items
FOR UPDATE
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.sales_person_id = auth.uid()
  )
)
WITH CHECK (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.sales_person_id = auth.uid()
  )
);
