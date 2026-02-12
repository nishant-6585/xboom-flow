
-- Allow anonymous users to read form fields for active forms
CREATE POLICY "Public can view fields of active forms"
ON public.form_fields
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id = form_fields.form_id
    AND forms.is_active = true
  )
);

-- Allow anonymous users to track form views
CREATE POLICY "Public can insert form views"
ON public.form_views
FOR INSERT
WITH CHECK (true);

-- Allow anonymous users to submit form responses
CREATE POLICY "Public can submit form responses"
ON public.form_submissions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id = form_submissions.form_id
    AND forms.is_active = true
  )
);
