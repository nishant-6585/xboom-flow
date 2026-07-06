
-- =========================================================
-- 1) leads_website_forms_gap: scope sales SELECT away from
--    specialty page_urls that belong to supply_chain / IT
-- =========================================================
DROP POLICY IF EXISTS leads_select_sales_admin ON public.leads;
CREATE POLICY leads_select_sales_admin
ON public.leads
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
    AND (
      page_url IS NULL
      OR (
        page_url !~~* '%sell-your-used-drones%'
        AND page_url !~~* '%rent-a-drone%'
        AND page_url !~~* '%drone-repair%'
      )
    )
  )
);

-- =========================================================
-- 2) form_fields_public_readable: gate public read on an
--    explicit is_public flag on forms
-- =========================================================
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Preserve current behavior: existing active forms stay publicly viewable.
-- Admins can flip internal forms to is_public=false to hide their structure.
UPDATE public.forms SET is_public = true WHERE is_active = true AND is_public = false;

DROP POLICY IF EXISTS "Public can view active form fields" ON public.form_fields;
DROP POLICY IF EXISTS "Public can view fields of active forms" ON public.form_fields;

CREATE POLICY "Public can view fields of public active forms"
ON public.form_fields
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.forms f
    WHERE f.id = form_fields.form_id
      AND f.is_active = true
      AND f.is_public = true
  )
);

-- =========================================================
-- 3) ticket_attachments_broad_insert: require uploader's own
--    uuid to be the first folder segment (mirrors DELETE policy)
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can upload ticket attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload ticket attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND is_user_approved(auth.uid())
  AND (storage.foldername(name))[1] = auth.uid()::text
);
