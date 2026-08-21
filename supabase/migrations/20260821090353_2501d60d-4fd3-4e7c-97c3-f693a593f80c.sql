-- =====================================================
-- Imports RLS: align the database with what the UI grants
-- =====================================================
-- The imports policies written in 20260224113758 predate the Imports tab being
-- opened to finance, and they let ANY approved user create an import.
--
-- Two concrete mismatches this fixes:
--
--   1. /procurement admits admin, supply_chain and finance, and the
--      import-documents storage policies already grant finance SELECT — but the
--      imports TABLE policy does not. A finance user therefore saw the Imports
--      tab, could open a document if handed its path, and got an empty list.
--
--   2. INSERT only required `created_by = auth.uid()`. Any approved user —
--      sales, HR, support — could create imports through the API and then read,
--      update and delete their own, despite having no route to the feature.
--
-- Effective model after this migration:
--   admin         full control
--   supply_chain  create / read / update, delete only own
--   finance       read-only (matches its read-only posture elsewhere in procurement)
--   everyone else no access

-- ---------- imports ----------
DROP POLICY IF EXISTS "Approved users can view imports" ON public.imports;
DROP POLICY IF EXISTS "Approved users can create imports" ON public.imports;
DROP POLICY IF EXISTS "Approved users can update imports" ON public.imports;
DROP POLICY IF EXISTS "Approved users can delete imports" ON public.imports;

CREATE POLICY "Procurement roles can view imports"
  ON public.imports FOR SELECT TO authenticated
  USING (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
      OR has_role(auth.uid(), 'finance'::app_role)
    )
  );

-- Creation is a supply-chain action. `created_by` must still be the caller so
-- ownership cannot be forged.
CREATE POLICY "Admin/supply_chain can create imports"
  ON public.imports FOR INSERT TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND created_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

CREATE POLICY "Admin/supply_chain can update imports"
  ON public.imports FOR UPDATE TO authenticated
  USING (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  )
  WITH CHECK (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supply_chain'::app_role)
    )
  );

-- Deleting an import cascades its line items. Admins always; supply_chain only
-- for records they raised themselves.
CREATE POLICY "Admin or owning supply_chain can delete imports"
  ON public.imports FOR DELETE TO authenticated
  USING (
    is_user_approved(auth.uid()) AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'supply_chain'::app_role) AND created_by = auth.uid())
    )
  );

-- ---------- import_items ----------
-- Line items inherit their parent's visibility. Keep the EXISTS-on-parent shape
-- from 20260224115052 so the two tables cannot drift apart, but route the role
-- test through the parent rather than repeating it.
DROP POLICY IF EXISTS "Users can view own import items or admin/sc" ON public.import_items;
DROP POLICY IF EXISTS "Users can create import items for own imports" ON public.import_items;
DROP POLICY IF EXISTS "Users can update own import items" ON public.import_items;
DROP POLICY IF EXISTS "Users can delete own import items" ON public.import_items;

CREATE POLICY "Import items follow parent import read access"
  ON public.import_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_items.import_id));

CREATE POLICY "Import items follow parent import write access"
  ON public.import_items FOR INSERT TO authenticated
  WITH CHECK (
    is_user_approved(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    AND EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_items.import_id)
  );

CREATE POLICY "Import items follow parent import update access"
  ON public.import_items FOR UPDATE TO authenticated
  USING (
    is_user_approved(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    AND EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_items.import_id)
  );

CREATE POLICY "Import items follow parent import delete access"
  ON public.import_items FOR DELETE TO authenticated
  USING (
    is_user_approved(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply_chain'::app_role))
    AND EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_items.import_id)
  );