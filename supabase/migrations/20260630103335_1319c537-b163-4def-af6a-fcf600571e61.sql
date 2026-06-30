
DROP POLICY IF EXISTS "Authenticated can view rentals" ON public.rental_records;
DROP POLICY IF EXISTS "Authenticated can insert rentals" ON public.rental_records;
DROP POLICY IF EXISTS "Authenticated can update rentals" ON public.rental_records;

CREATE POLICY "Internal staff can view rentals"
ON public.rental_records FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
);

CREATE POLICY "Internal staff can insert rentals"
ON public.rental_records FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
);

CREATE POLICY "Internal staff can update rentals"
ON public.rental_records FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
);
