
DROP POLICY IF EXISTS "Approved users can manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Approved users can manage invoice payments" ON public.invoice_payments;

CREATE POLICY "Finance and admin can manage invoice items"
ON public.invoice_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage invoice payments"
ON public.invoice_payments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));
