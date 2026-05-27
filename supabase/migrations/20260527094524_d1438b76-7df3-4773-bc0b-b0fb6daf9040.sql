
-- Grant IT role full access to Forms (forms, submissions, permissions)

DROP POLICY IF EXISTS "Users can view forms" ON public.forms;
CREATE POLICY "Users can view forms" ON public.forms FOR SELECT
USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it'::app_role) OR has_form_permission(auth.uid(),'view_forms')));

DROP POLICY IF EXISTS "Users can create forms" ON public.forms;
CREATE POLICY "Users can create forms" ON public.forms FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it'::app_role) OR has_form_permission(auth.uid(),'create_forms')));

DROP POLICY IF EXISTS "Users can update forms" ON public.forms;
CREATE POLICY "Users can update forms" ON public.forms FOR UPDATE
USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it'::app_role) OR has_form_permission(auth.uid(),'edit_forms')));

DROP POLICY IF EXISTS "Users can delete forms" ON public.forms;
CREATE POLICY "Users can delete forms" ON public.forms FOR DELETE
USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it'::app_role) OR has_form_permission(auth.uid(),'edit_forms')));

DROP POLICY IF EXISTS "Authenticated users can view form submissions" ON public.form_submissions;
CREATE POLICY "Authenticated users can view form submissions" ON public.form_submissions FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it'::app_role) OR has_form_permission(auth.uid(),'view_submissions')));

DROP POLICY IF EXISTS "Authenticated users can delete form submissions" ON public.form_submissions;
CREATE POLICY "Authenticated users can delete form submissions" ON public.form_submissions FOR DELETE TO authenticated
USING (is_user_approved(auth.uid()) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'it'::app_role) OR has_form_permission(auth.uid(),'delete_submissions')));

-- Assign IT role to Rohit so he can access Forms
INSERT INTO public.user_roles (user_id, role)
VALUES ('9fea57d6-a27a-4b35-9293-e2151b84f45a', 'it'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;
