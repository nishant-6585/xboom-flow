-- Drop the current SELECT policy that applies to public role
DROP POLICY IF EXISTS "Users can view form submissions" ON public.form_submissions;

-- Create a new SELECT policy that explicitly only applies to authenticated users
CREATE POLICY "Authenticated users can view form submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_form_permission(auth.uid(), 'view_submissions'::text)
  )
);

-- Also fix the DELETE policy to be explicit about authenticated role
DROP POLICY IF EXISTS "Users can delete form submissions" ON public.form_submissions;

CREATE POLICY "Authenticated users can delete form submissions"
ON public.form_submissions
FOR DELETE
TO authenticated
USING (
  is_user_approved(auth.uid()) 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_form_permission(auth.uid(), 'delete_submissions'::text)
  )
);