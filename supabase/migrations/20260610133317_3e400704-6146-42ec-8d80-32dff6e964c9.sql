DROP POLICY IF EXISTS "Authenticated can view courier partners" ON public.courier_partners;
CREATE POLICY "Approved internal users can view courier partners"
ON public.courier_partners
FOR SELECT
TO authenticated
USING (public.is_user_approved(auth.uid()));