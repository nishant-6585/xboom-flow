
-- Leave requests: restrict viewing to own + HR + Admin
DROP POLICY IF EXISTS "Approved users can view leave requests" ON public.leave_requests;

CREATE POLICY "Own/HR/Admin can view leave requests"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- agent_user_mapping: restrict select to admin or own row
DROP POLICY IF EXISTS "agent_user_mapping_select_authenticated" ON public.agent_user_mapping;

CREATE POLICY "agent_user_mapping_select_admin_or_owner"
ON public.agent_user_mapping
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
);

-- referral-resumes: scope INSERT to user's own folder
DROP POLICY IF EXISTS "Authenticated upload referral resumes" ON storage.objects;

CREATE POLICY "Users upload own referral resumes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'referral-resumes'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- avatars: remove broad listing policy; public URLs still resolve via bucket public flag.
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;

CREATE POLICY "Avatars readable by authenticated users"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');
