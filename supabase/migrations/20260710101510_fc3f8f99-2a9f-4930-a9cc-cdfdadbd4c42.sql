-- form-attachments: restrict SELECT to admin/it or users with view_submissions form permission
DROP POLICY IF EXISTS "Approved users can view form attachments" ON storage.objects;
DROP POLICY IF EXISTS "Approved users can read form attachments" ON storage.objects;

CREATE POLICY "Form attachments readable by admin/it or view_submissions"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'form-attachments'
  AND is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'it'::app_role)
    OR has_form_permission(auth.uid(), 'view_submissions')
  )
);

-- training-uploads: restrict SELECT to admin/hr only
DROP POLICY IF EXISTS "Approved users can view training uploads" ON storage.objects;

CREATE POLICY "Training uploads readable by admin/hr"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'training-uploads'
  AND is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
  )
);

-- training-pictures: restrict SELECT to admin/hr or owning uploader (folder = uid)
DROP POLICY IF EXISTS "Authenticated users can view training pictures" ON storage.objects;

CREATE POLICY "Training pictures readable by admin/hr or owner"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'training-pictures'
  AND is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR (storage.foldername(name))[1] = (auth.uid())::text
  )
);