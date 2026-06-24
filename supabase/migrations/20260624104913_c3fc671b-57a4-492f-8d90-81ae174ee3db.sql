DROP POLICY IF EXISTS "Sales can view invoices for their orders" ON storage.objects;

CREATE POLICY "Sales can view invoices for their orders"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales'::app_role)
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.order_invoices oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.storage_path = storage.objects.name
        AND (o.sales_person_id = auth.uid() OR o.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.order_invoices oi
      JOIN public.woocommerce_orders wo ON wo.id = oi.woocommerce_order_id
      WHERE oi.storage_path = storage.objects.name
        AND wo.assigned_to = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Sales managers can view all invoices" ON storage.objects;
CREATE POLICY "Sales managers can view all invoices"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'sales_manager'::app_role)
);