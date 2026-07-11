
-- Fix 1: company_contacts_broad_crud_access — restrict to CRM-relevant roles
DROP POLICY IF EXISTS "Approved users can view company contacts" ON public.company_contacts;
DROP POLICY IF EXISTS "Approved users can create company contacts" ON public.company_contacts;
DROP POLICY IF EXISTS "Approved users can update company contacts" ON public.company_contacts;
DROP POLICY IF EXISTS "Approved users can delete company contacts" ON public.company_contacts;

CREATE POLICY "CRM roles can view company contacts"
  ON public.company_contacts FOR SELECT
  USING (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

CREATE POLICY "CRM roles can create company contacts"
  ON public.company_contacts FOR INSERT
  WITH CHECK (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

CREATE POLICY "CRM roles can update company contacts"
  ON public.company_contacts FOR UPDATE
  USING (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

CREATE POLICY "CRM roles can delete company contacts"
  ON public.company_contacts FOR DELETE
  USING (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'sales'::app_role)
      OR has_role(auth.uid(), 'sales_manager'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

-- Fix 2: spare_parts_inventory_margin_exposure — remove sales role from cost/margin exposure
-- Align with pricelist pattern (admin/finance/sales_manager/supply_chain).
DROP POLICY IF EXISTS spare_parts_select ON public.spare_parts_inventory;
CREATE POLICY spare_parts_select
  ON public.spare_parts_inventory FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  );

DROP POLICY IF EXISTS spare_parts_sales_select ON public.spare_parts_sales;
CREATE POLICY spare_parts_sales_select
  ON public.spare_parts_sales FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  );

DROP POLICY IF EXISTS spare_parts_tx_select ON public.spare_parts_transactions;
CREATE POLICY spare_parts_tx_select
  ON public.spare_parts_transactions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  );
