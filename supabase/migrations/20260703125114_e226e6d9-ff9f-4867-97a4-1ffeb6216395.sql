
-- 1) FORMS: column-restrict anonymous access so created_by/created_by_name are not readable by anon.
--    Keep row-level policy so form_fields' EXISTS subquery still resolves, and forms_public view still works.
REVOKE SELECT ON public.forms FROM anon;
GRANT SELECT (id, name, description, is_active, created_at, updated_at) ON public.forms TO anon;

-- 2) USER_ROLES: HR cannot self-assign roles and cannot grant privileged operational roles (hr, it, sales_manager).
DROP POLICY IF EXISTS "HR can insert non-privileged user roles" ON public.user_roles;
CREATE POLICY "HR can insert non-privileged user roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'hr'::app_role)
  AND is_user_approved(auth.uid())
  AND role NOT IN ('admin'::app_role, 'finance'::app_role, 'supply_chain'::app_role, 'hr'::app_role, 'it'::app_role, 'sales_manager'::app_role)
  AND user_id <> auth.uid()
);

-- 3) EMPLOYEES: HR cannot update their own employee record (Admin still can).
DROP POLICY IF EXISTS "HR users can update employee details" ON public.employees;
CREATE POLICY "HR users can update employee details"
ON public.employees
FOR UPDATE
TO authenticated
USING (
  is_hr_or_admin(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR user_id IS DISTINCT FROM auth.uid())
)
WITH CHECK (
  is_hr_or_admin(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR user_id IS DISTINCT FROM auth.uid())
);

-- 4) SALARY_SHEET_ENTRIES: HR cannot insert/update/delete rows belonging to their own employee record.
DROP POLICY IF EXISTS "HR/Admin can insert salary entries" ON public.salary_sheet_entries;
CREATE POLICY "HR/Admin can insert salary entries"
ON public.salary_sheet_entries
FOR INSERT
TO authenticated
WITH CHECK (
  is_hr_or_admin(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salary_sheet_entries.employee_id AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "HR/Admin can update salary entries" ON public.salary_sheet_entries;
CREATE POLICY "HR/Admin can update salary entries"
ON public.salary_sheet_entries
FOR UPDATE
TO authenticated
USING (
  is_hr_or_admin(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salary_sheet_entries.employee_id AND e.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  is_hr_or_admin(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salary_sheet_entries.employee_id AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "HR/Admin can delete salary entries" ON public.salary_sheet_entries;
CREATE POLICY "HR/Admin can delete salary entries"
ON public.salary_sheet_entries
FOR DELETE
TO authenticated
USING (
  is_hr_or_admin(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salary_sheet_entries.employee_id AND e.user_id = auth.uid()
    )
  )
);

-- 5) LEAVE_BALANCES: HR cannot manage their own leave balances (Admin still can).
DROP POLICY IF EXISTS "System and admin can manage leave balances" ON public.leave_balances;
CREATE POLICY "System and admin can manage leave balances"
ON public.leave_balances
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role, 'hr'::app_role])
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_balances.employee_id AND e.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role, 'hr'::app_role])
  )
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_balances.employee_id AND e.user_id = auth.uid()
    )
  )
);
