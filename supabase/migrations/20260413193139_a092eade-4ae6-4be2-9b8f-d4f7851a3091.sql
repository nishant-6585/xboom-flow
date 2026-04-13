CREATE POLICY "Authenticated users can update abandoned carts"
ON public.abandoned_carts
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role can update abandoned carts"
ON public.abandoned_carts
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);