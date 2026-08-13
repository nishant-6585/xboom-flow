DROP POLICY "Admin/HR/SalesMgr update compoff ledger" ON public.compoff_ledger;

CREATE POLICY "Admin/HR/SalesMgr update compoff ledger"
ON public.compoff_ledger FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR (
    has_role(auth.uid(), 'sales_manager'::app_role)
    AND compoff_employee_is_sales(employee_id)
    AND NOT (employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR (
    has_role(auth.uid(), 'sales_manager'::app_role)
    AND compoff_employee_is_sales(employee_id)
    AND NOT (employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()))
  )
);