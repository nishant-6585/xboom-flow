-- Fix form-attachments bucket: make private and restrict policies

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'form-attachments';

-- Drop open policies
DROP POLICY IF EXISTS "Anyone can upload form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read form attachments" ON storage.objects;

-- Create authenticated-only read policy
CREATE POLICY "Authenticated users can read form attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'form-attachments');