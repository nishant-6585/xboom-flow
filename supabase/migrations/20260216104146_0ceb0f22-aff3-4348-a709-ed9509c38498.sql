
-- Make the bucket private and add file restrictions
UPDATE storage.buckets 
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'form-attachments';

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can upload form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read form attachments" ON storage.objects;

-- Authenticated approved users can read form attachments
CREATE POLICY "Approved users can view form attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'form-attachments' AND
  is_user_approved(auth.uid())
);

-- Allow service role uploads only (via edge function)
-- No direct upload policy for anon/authenticated - uploads go through edge function
-- Admins can delete form attachments
CREATE POLICY "Admins can delete form attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'form-attachments' AND
  has_role(auth.uid(), 'admin'::app_role)
);
