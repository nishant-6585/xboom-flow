DROP POLICY IF EXISTS "Document-level hr document access" ON storage.objects;

CREATE POLICY "Document-level hr document access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND is_user_approved(auth.uid())
  AND (
    is_hr_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.hr_documents hd
      WHERE hd.file_url = storage.objects.name
        AND can_view_hr_document(auth.uid(), hd.id)
    )
  )
);