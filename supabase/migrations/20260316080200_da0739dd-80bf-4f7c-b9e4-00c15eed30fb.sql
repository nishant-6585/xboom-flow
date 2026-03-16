
DROP POLICY IF EXISTS "resignation_requests_insert" ON public.resignation_requests;

CREATE POLICY "resignation_requests_insert"
ON public.resignation_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_hr_or_admin(auth.uid())
);
