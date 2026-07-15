
-- Authenticated users can upload evidence into their own folder (path prefix = auth.uid()/...)
CREATE POLICY "attribution_evidence_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attribution-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authenticated users can read/delete their own uploads
CREATE POLICY "attribution_evidence_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attribution-evidence'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  )
);

CREATE POLICY "attribution_evidence_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attribution-evidence'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);
