-- Add missing policies for supply_chain to create/update/delete pipeline orders
CREATE POLICY "Supply chain can create pipeline orders"
ON public.pipeline_orders FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'supply_chain'::app_role)
);

CREATE POLICY "Supply chain can update pipeline orders"
ON public.pipeline_orders FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'supply_chain'::app_role)
);

CREATE POLICY "Supply chain can delete pipeline orders"
ON public.pipeline_orders FOR DELETE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'supply_chain'::app_role)
);