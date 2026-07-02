-- Restrict compoff_ledger inserts to HR/Admin only (prevent self-granting comp-off credits)
DROP POLICY IF EXISTS "Employees insert own compoff ledger" ON public.compoff_ledger;

CREATE POLICY "Admin/HR insert compoff ledger"
ON public.compoff_ledger
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);