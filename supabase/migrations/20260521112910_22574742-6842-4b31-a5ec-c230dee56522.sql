
DROP POLICY IF EXISTS "Authenticated users view hiring requirements" ON public.hiring_requirements;

CREATE POLICY "Internal users view hiring requirements"
ON public.hiring_requirements
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_user_approved(auth.uid())
);

DROP POLICY IF EXISTS "Authenticated can read monthly pulse files" ON storage.objects;

CREATE POLICY "Approved internal users read monthly pulse files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'monthly-pulses'
  AND is_user_approved(auth.uid())
);
