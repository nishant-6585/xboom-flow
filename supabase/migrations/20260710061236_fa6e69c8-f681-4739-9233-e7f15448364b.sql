
-- 1) admin_signatures: restrict SELECT to owning admin
DROP POLICY IF EXISTS "Admins can view signatures" ON public.admin_signatures;
CREATE POLICY "Admins can view own signature"
  ON public.admin_signatures
  FOR SELECT
  USING (admin_id = auth.uid() AND has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket: restrict SELECT to owner folder (path starts with their user id)
DROP POLICY IF EXISTS "Admins can view signatures" ON storage.objects;
CREATE POLICY "Admins can view own signature file"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'admin-signatures'
    AND has_role(auth.uid(), 'admin'::app_role)
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2) ai_temp_permissions: finance/HR are read-only on own rows; only admin can grant
DROP POLICY IF EXISTS "Finance can manage own finance temp permissions" ON public.ai_temp_permissions;
DROP POLICY IF EXISTS "HR can manage own HR temp permissions" ON public.ai_temp_permissions;

CREATE POLICY "Finance can view own finance temp permissions"
  ON public.ai_temp_permissions
  FOR SELECT
  USING (
    has_role(auth.uid(), 'finance'::app_role)
    AND user_id = auth.uid()
    AND data_type = ANY (ARRAY['payment','expense','invoice','cashflow'])
  );

CREATE POLICY "HR can view own HR temp permissions"
  ON public.ai_temp_permissions
  FOR SELECT
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND user_id = auth.uid()
    AND data_type = ANY (ARRAY['salary','bank_details','pan','attendance','leave','employee_personal'])
  );

-- 3) ai_access_requests: finance/HR can view (not approve) requests in their domain,
--    excluding requests they themselves submitted. Only admins can create/update/delete
--    (they already have "Admins can manage all access requests" ALL policy).
DROP POLICY IF EXISTS "Finance can manage finance access requests" ON public.ai_access_requests;
DROP POLICY IF EXISTS "HR can manage HR access requests" ON public.ai_access_requests;

CREATE POLICY "Finance can view finance access requests"
  ON public.ai_access_requests
  FOR SELECT
  USING (
    has_role(auth.uid(), 'finance'::app_role)
    AND requested_data_type = ANY (ARRAY['payment','expense','invoice','cashflow'])
    AND requester_user_id <> auth.uid()
  );

CREATE POLICY "HR can view HR access requests"
  ON public.ai_access_requests
  FOR SELECT
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND requested_data_type = ANY (ARRAY['salary','bank_details','pan','attendance','leave','employee_personal'])
    AND requester_user_id <> auth.uid()
  );
