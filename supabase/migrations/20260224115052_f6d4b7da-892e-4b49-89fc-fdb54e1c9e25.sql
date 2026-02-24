
-- =====================================================
-- PHASE 1.5b: View Security + Import Items Tightening
-- =====================================================

-- =====================================================
-- 1. Convert Security Definer Views to Security Invoker
-- =====================================================
-- This ensures the QUERYING USER's RLS applies, not the view creator's.

-- forms_public: forms table already has "Public can view active forms" USING (is_active = true)
-- so anon/public access is preserved through the underlying table's RLS.
ALTER VIEW public.forms_public SET (security_invoker = on);

-- invoice_aging_view: invoices table has approved-user SELECT policy
ALTER VIEW public.invoice_aging_view SET (security_invoker = on);

-- pricelist_public: Need to add approved-user SELECT first, since currently
-- only admin/supply_chain have SELECT on pricelist table.
-- The view strips nothing sensitive (dealer_price is visible), so broad read is acceptable.
CREATE POLICY "Approved users can view pricelist"
ON public.pricelist
FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

ALTER VIEW public.pricelist_public SET (security_invoker = on);

-- sales_weighted_forecast_view: pipeline_orders already has role-scoped SELECT
ALTER VIEW public.sales_weighted_forecast_view SET (security_invoker = on);

-- =====================================================
-- 2. Tighten import_items to scope by parent import owner
-- =====================================================
-- Currently: any approved user can see ALL import items.
-- Fix: scope to items where parent import belongs to the user, admin, or supply_chain.

-- Drop existing overly-broad policies
DROP POLICY IF EXISTS "Approved users can view import items" ON public.import_items;
DROP POLICY IF EXISTS "Approved users can create import items" ON public.import_items;
DROP POLICY IF EXISTS "Approved users can update import items" ON public.import_items;
DROP POLICY IF EXISTS "Approved users can delete import items" ON public.import_items;

-- SELECT: scoped to parent import ownership or admin/supply_chain
CREATE POLICY "Users can view own import items or admin/sc"
ON public.import_items
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.imports i
      WHERE i.id = import_items.import_id
      AND (i.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    )
  )
);

-- INSERT: scoped to parent import ownership or admin/supply_chain
CREATE POLICY "Users can create import items for own imports"
ON public.import_items
FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.imports i
      WHERE i.id = import_items.import_id
      AND (i.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    )
  )
);

-- UPDATE: scoped to parent import ownership or admin/supply_chain
CREATE POLICY "Users can update own import items"
ON public.import_items
FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.imports i
      WHERE i.id = import_items.import_id
      AND (i.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    )
  )
);

-- DELETE: scoped to parent import ownership or admin/supply_chain
CREATE POLICY "Users can delete own import items"
ON public.import_items
FOR DELETE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    EXISTS (
      SELECT 1 FROM public.imports i
      WHERE i.id = import_items.import_id
      AND (i.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    )
  )
);
