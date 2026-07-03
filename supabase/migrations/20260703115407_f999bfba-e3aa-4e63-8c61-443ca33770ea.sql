DROP POLICY IF EXISTS "Users see own or shared saved views" ON public.company_saved_views;
CREATE POLICY "Users see own or shared saved views" ON public.company_saved_views
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    is_shared = true
    AND public.is_user_approved(auth.uid())
    AND NOT public.has_role(auth.uid(), 'b2b_customer'::app_role)
  )
);