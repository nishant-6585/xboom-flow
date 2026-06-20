
-- Invoices
DROP POLICY IF EXISTS "Approved users can view invoices" ON public.invoices;
CREATE POLICY "Privileged roles can view invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

DROP POLICY IF EXISTS "Approved users can view invoice items" ON public.invoice_items;
CREATE POLICY "Privileged roles can view invoice items" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

DROP POLICY IF EXISTS "Approved users can view invoice payments" ON public.invoice_payments;
CREATE POLICY "Privileged roles can view invoice payments" ON public.invoice_payments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'finance'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Email leads
DROP POLICY IF EXISTS "Approved users can view email leads" ON public.email_leads;
CREATE POLICY "Privileged roles can view email leads" ON public.email_leads
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Repairs
DROP POLICY IF EXISTS "Approved users can view repairs" ON public.repairs;
CREATE POLICY "Privileged roles can view repairs" ON public.repairs
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
);

-- Storage: remove broad "approved users" select on payment-screenshots
DROP POLICY IF EXISTS "Approved users can view payment screenshots" ON storage.objects;
