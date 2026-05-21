
-- Fix ai_access_logs: enforce user_id = auth.uid() on insert
DROP POLICY IF EXISTS "System can insert access logs" ON public.ai_access_logs;
CREATE POLICY "Users can insert their own access logs"
ON public.ai_access_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Fix ai_action_queue: enforce user_id = auth.uid() on insert
DROP POLICY IF EXISTS "System and admins can insert queue" ON public.ai_action_queue;
CREATE POLICY "Users can insert own queue entries"
ON public.ai_action_queue
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Fix ai_resolution_metrics: restrict insert to service role (admins)
DROP POLICY IF EXISTS "Service role can insert metrics" ON public.ai_resolution_metrics;
CREATE POLICY "Admins can insert metrics"
ON public.ai_resolution_metrics
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix campaign_spend: restrict SELECT to privileged roles
DROP POLICY IF EXISTS "Authenticated users can view campaign_spend" ON public.campaign_spend;
CREATE POLICY "Privileged roles can view campaign_spend"
ON public.campaign_spend
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
);

-- Fix avatars bucket listing: remove broad SELECT on storage.objects.
-- Public URLs continue to resolve (bucket public=true); only the list API is restricted.
DROP POLICY IF EXISTS "Avatars readable by authenticated users" ON storage.objects;
CREATE POLICY "Users can list own avatar folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
