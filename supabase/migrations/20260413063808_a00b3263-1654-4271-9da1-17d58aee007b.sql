
-- 1. Fix call_logs SELECT policy: restrict to role-scoped access
DROP POLICY IF EXISTS "Authenticated users can view call logs" ON public.call_logs;

CREATE POLICY "Role-scoped call log access"
ON public.call_logs FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'hr'::app_role) OR
    has_role(auth.uid(), 'sales'::app_role) OR
    sales_person_id = auth.uid()
  )
);

-- 2. Fix hr-documents storage SELECT policy: enforce document-level access
DROP POLICY IF EXISTS "Authenticated users can view hr documents" ON storage.objects;

CREATE POLICY "Document-level hr document access"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'hr-documents' AND
  is_user_approved(auth.uid()) AND (
    -- HR/Admin can view all
    is_hr_or_admin(auth.uid())
    -- Others: check document-level access via file path matching
    OR EXISTS (
      SELECT 1 FROM public.hr_documents hd
      WHERE hd.file_url LIKE '%' || storage.filename(name)
      AND public.can_view_hr_document(auth.uid(), hd.id)
    )
  )
);

-- 3. Enable RLS on form_lead_contact_us_counter
ALTER TABLE public.form_lead_contact_us_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage counter"
ON public.form_lead_contact_us_counter FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow the trigger function to read/update (service role or via security definer)
CREATE POLICY "System can use counter"
ON public.form_lead_contact_us_counter FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Add policies for lead_assignment_counter (system table)
CREATE POLICY "Admin can manage lead assignment counter"
ON public.lead_assignment_counter FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages lead assignment counter"
ON public.lead_assignment_counter FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Add policies for rate_limit_buckets (system table)
CREATE POLICY "Admin can view rate limit buckets"
ON public.rate_limit_buckets FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages rate limit buckets"
ON public.rate_limit_buckets FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
