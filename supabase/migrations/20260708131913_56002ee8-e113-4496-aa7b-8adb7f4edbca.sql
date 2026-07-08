
-- ── 1) pricelist: scope broad SELECT to roles with business need ──────────
DROP POLICY IF EXISTS "Approved users can view pricelist" ON public.pricelist;

CREATE POLICY "Approved business roles can view pricelist"
ON public.pricelist
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  )
);

-- Extend the existing "full pricelist" SELECT policy to include finance so
-- finance keeps cost-price visibility even if the broader policy is tightened
-- further later.
DROP POLICY IF EXISTS "Admin and supply_chain can view full pricelist" ON public.pricelist;

CREATE POLICY "Admin finance and supply_chain can view full pricelist"
ON public.pricelist
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

-- ── 2) ai_temp_permissions: block cross-user grants by Finance/HR ────────
DROP POLICY IF EXISTS "Finance can manage finance temp permissions" ON public.ai_temp_permissions;
DROP POLICY IF EXISTS "HR can manage HR temp permissions" ON public.ai_temp_permissions;

CREATE POLICY "Finance can manage own finance temp permissions"
ON public.ai_temp_permissions
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'finance'::app_role)
  AND user_id = auth.uid()
  AND data_type = ANY (ARRAY['payment'::text, 'expense'::text, 'invoice'::text, 'cashflow'::text])
)
WITH CHECK (
  has_role(auth.uid(), 'finance'::app_role)
  AND user_id = auth.uid()
  AND data_type = ANY (ARRAY['payment'::text, 'expense'::text, 'invoice'::text, 'cashflow'::text])
);

CREATE POLICY "HR can manage own HR temp permissions"
ON public.ai_temp_permissions
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'hr'::app_role)
  AND user_id = auth.uid()
  AND data_type = ANY (ARRAY['salary'::text, 'bank_details'::text, 'pan'::text, 'attendance'::text, 'leave'::text, 'employee_personal'::text])
)
WITH CHECK (
  has_role(auth.uid(), 'hr'::app_role)
  AND user_id = auth.uid()
  AND data_type = ANY (ARRAY['salary'::text, 'bank_details'::text, 'pan'::text, 'attendance'::text, 'leave'::text, 'employee_personal'::text])
);
