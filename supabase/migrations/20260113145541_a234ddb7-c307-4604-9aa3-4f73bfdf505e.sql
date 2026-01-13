-- Add INSERT policy for sales users to create orders
CREATE POLICY "Sales can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role)
  AND sales_person_id = auth.uid()
);