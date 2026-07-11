-- Restrict UPDATE/DELETE on cc_payments to admins only. Finance keeps SELECT and INSERT.
DROP POLICY IF EXISTS "Admin/finance can update payments" ON public.cc_payments;
DROP POLICY IF EXISTS "Admin/finance can delete payments" ON public.cc_payments;

CREATE POLICY "Admins can update payments"
  ON public.cc_payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payments"
  ON public.cc_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));