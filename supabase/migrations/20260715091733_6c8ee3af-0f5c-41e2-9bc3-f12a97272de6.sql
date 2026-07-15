DROP POLICY IF EXISTS "Approved users can create companies" ON public.companies;
CREATE POLICY "CRM roles can create companies" ON public.companies
FOR INSERT TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'sales_manager'::app_role) OR
    has_role(auth.uid(), 'sales'::app_role) OR
    has_role(auth.uid(), 'supply_chain'::app_role) OR
    has_role(auth.uid(), 'finance'::app_role)
  )
);