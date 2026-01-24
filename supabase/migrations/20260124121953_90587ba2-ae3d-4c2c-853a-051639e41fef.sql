-- Allow public/anonymous users to read ACTIVE forms (needed for embed functionality)
CREATE POLICY "Public can view active forms"
ON public.forms
FOR SELECT
USING (is_active = true);