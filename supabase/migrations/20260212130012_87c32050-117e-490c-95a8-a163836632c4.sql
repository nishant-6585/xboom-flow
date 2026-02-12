-- Allow anonymous/public users to read active forms (needed for form embed page)
CREATE POLICY "Public can view active forms"
ON public.forms
FOR SELECT
USING (is_active = true);
