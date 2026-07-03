
-- Companies: restrict UPDATE
DROP POLICY IF EXISTS "Approved users can update companies" ON public.companies;
CREATE POLICY "Privileged or owner can update companies"
ON public.companies FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR account_owner_id = auth.uid()
    OR created_by = auth.uid()
  )
)
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR account_owner_id = auth.uid()
    OR created_by = auth.uid()
  )
);

-- Invoices: restrict UPDATE
DROP POLICY IF EXISTS "Approved users can update invoices" ON public.invoices;
CREATE POLICY "Privileged or owner can update invoices"
ON public.invoices FOR UPDATE
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR created_by = auth.uid()
    OR signed_by = auth.uid()
    OR submitted_by = auth.uid()
  )
)
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR created_by = auth.uid()
    OR signed_by = auth.uid()
    OR submitted_by = auth.uid()
  )
);

-- User roles: remove broad visibility
DROP POLICY IF EXISTS "Approved users can view all roles" ON public.user_roles;
-- Existing "Admins can view all roles" and "Users can view their own role" remain.
-- Add HR access to full list for role management.
CREATE POLICY "HR can view all roles"
ON public.user_roles FOR SELECT
USING (has_role(auth.uid(), 'hr'::app_role) AND is_user_approved(auth.uid()));

-- Login history: drop anonymous insert
DROP POLICY IF EXISTS "Anon can insert failed login attempts" ON public.login_history;
