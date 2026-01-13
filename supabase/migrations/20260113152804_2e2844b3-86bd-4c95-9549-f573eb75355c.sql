-- Add INSERT policy for sales users to create order items for their own orders
CREATE POLICY "Sales can create order items for own orders"
ON public.order_items
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.orders o 
    WHERE o.id = order_id 
    AND o.sales_person_id = auth.uid()
  )
);

-- Add INSERT policy for sales users to upload purchase orders
CREATE POLICY "Sales can upload purchase orders"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'purchase-orders'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales'::app_role)
);

-- Add SELECT policy for sales users to view their own purchase orders
CREATE POLICY "Sales can view own purchase orders"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'purchase-orders'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales'::app_role)
);