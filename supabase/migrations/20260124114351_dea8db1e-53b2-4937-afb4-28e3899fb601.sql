-- Create form permissions table for granular access control
CREATE TABLE public.form_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_forms BOOLEAN NOT NULL DEFAULT true,
  can_create_forms BOOLEAN NOT NULL DEFAULT false,
  can_edit_forms BOOLEAN NOT NULL DEFAULT false,
  can_view_submissions BOOLEAN NOT NULL DEFAULT false,
  can_delete_submissions BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.form_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage form permissions
CREATE POLICY "Admins can manage form permissions"
ON public.form_permissions
FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own permissions
CREATE POLICY "Users can view own permissions"
ON public.form_permissions
FOR SELECT
USING (auth.uid() = user_id AND is_user_approved(auth.uid()));

-- Create security definer function to check form permissions
CREATE OR REPLACE FUNCTION public.has_form_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _permission
    WHEN 'view_forms' THEN COALESCE((SELECT can_view_forms FROM public.form_permissions WHERE user_id = _user_id), false)
    WHEN 'create_forms' THEN COALESCE((SELECT can_create_forms FROM public.form_permissions WHERE user_id = _user_id), false)
    WHEN 'edit_forms' THEN COALESCE((SELECT can_edit_forms FROM public.form_permissions WHERE user_id = _user_id), false)
    WHEN 'view_submissions' THEN COALESCE((SELECT can_view_submissions FROM public.form_permissions WHERE user_id = _user_id), false)
    WHEN 'delete_submissions' THEN COALESCE((SELECT can_delete_submissions FROM public.form_permissions WHERE user_id = _user_id), false)
    ELSE false
  END
$$;

-- Drop existing form policies that we need to replace
DROP POLICY IF EXISTS "Approved users can view forms" ON public.forms;
DROP POLICY IF EXISTS "Approved users can manage forms" ON public.forms;
DROP POLICY IF EXISTS "Approved users can view form fields" ON public.form_fields;
DROP POLICY IF EXISTS "Approved users can manage form fields" ON public.form_fields;
DROP POLICY IF EXISTS "Approved users can view submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Approved users can delete submissions" ON public.form_submissions;

-- Forms: View policy (admins always, or users with permission)
CREATE POLICY "Users can view forms"
ON public.forms
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'view_forms')
  )
);

-- Forms: Create policy
CREATE POLICY "Users can create forms"
ON public.forms
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'create_forms')
  )
);

-- Forms: Update policy
CREATE POLICY "Users can update forms"
ON public.forms
FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'edit_forms')
  )
);

-- Forms: Delete policy
CREATE POLICY "Users can delete forms"
ON public.forms
FOR DELETE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'edit_forms')
  )
);

-- Form Fields: View policy
CREATE POLICY "Users can view form fields"
ON public.form_fields
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'view_forms')
  )
);

-- Form Fields: Manage policy (create/update/delete)
CREATE POLICY "Users can manage form fields"
ON public.form_fields
FOR ALL
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'edit_forms')
  )
)
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'edit_forms')
  )
);

-- Form Submissions: View policy
CREATE POLICY "Users can view form submissions"
ON public.form_submissions
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'view_submissions')
  )
);

-- Form Submissions: Delete policy
CREATE POLICY "Users can delete form submissions"
ON public.form_submissions
FOR DELETE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_form_permission(auth.uid(), 'delete_submissions')
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_form_permissions_updated_at
  BEFORE UPDATE ON public.form_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();