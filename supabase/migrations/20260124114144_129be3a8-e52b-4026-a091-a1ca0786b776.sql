-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admin can manage forms" ON public.forms;
DROP POLICY IF EXISTS "Admin can manage form fields" ON public.form_fields;
DROP POLICY IF EXISTS "Admin can view all submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Admin can delete submissions" ON public.form_submissions;

-- Forms: Allow all approved users to manage
CREATE POLICY "Approved users can manage forms" 
ON public.forms 
FOR ALL 
USING (is_user_approved(auth.uid()))
WITH CHECK (is_user_approved(auth.uid()));

-- Form Fields: Allow all approved users to manage
CREATE POLICY "Approved users can manage form fields" 
ON public.form_fields 
FOR ALL 
USING (is_user_approved(auth.uid()))
WITH CHECK (is_user_approved(auth.uid()));

-- Form Submissions: Allow all approved users to view
CREATE POLICY "Approved users can view submissions" 
ON public.form_submissions 
FOR SELECT 
USING (is_user_approved(auth.uid()));

-- Form Submissions: Allow all approved users to delete
CREATE POLICY "Approved users can delete submissions" 
ON public.form_submissions 
FOR DELETE 
USING (is_user_approved(auth.uid()));