-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Supply chain can view all payment screenshots" ON storage.objects;

-- Make the payment-screenshots bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'payment-screenshots';

-- Create RLS policies for payment-screenshots bucket
-- Allow authenticated users to upload their own files
CREATE POLICY "Authenticated users can upload payment screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to view their own uploaded files
CREATE POLICY "Users can view their own payment screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-screenshots' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow admins to view all payment screenshots
CREATE POLICY "Admins can view all payment screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-screenshots' 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow supply_chain users to view all payment screenshots
CREATE POLICY "Supply chain can view all payment screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-screenshots' 
  AND public.has_role(auth.uid(), 'supply_chain'::public.app_role)
);