-- Create purchase-orders storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('purchase-orders', 'purchase-orders', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for purchase-orders bucket
CREATE POLICY "Authenticated users can view purchase orders"
ON storage.objects FOR SELECT
USING (bucket_id = 'purchase-orders' AND auth.role() = 'authenticated');

CREATE POLICY "Supply chain and admin can upload purchase orders"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'purchase-orders' 
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('supply_chain', 'admin'))
  )
);

CREATE POLICY "Supply chain and admin can update purchase orders"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'purchase-orders' 
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('supply_chain', 'admin'))
  )
);

CREATE POLICY "Admin can delete purchase orders"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'purchase-orders' 
  AND auth.role() = 'authenticated'
  AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
);