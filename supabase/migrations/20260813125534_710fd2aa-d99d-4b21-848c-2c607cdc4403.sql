DROP POLICY "HR/Admin can insert progress" ON public.employee_kpi_progress;

CREATE POLICY "HR/Admin can insert progress"
ON public.employee_kpi_progress FOR INSERT TO authenticated
WITH CHECK (
  is_hr_or_admin(auth.uid())
  AND (
    -- progress on someone else's KPI: unrestricted
    kpi_id NOT IN (
      SELECT ek.id
      FROM public.employee_kpis ek
      JOIN public.employees e ON e.id = ek.employee_id
      WHERE e.user_id = auth.uid()
    )
    -- progress on their own KPI must stay pending and unapproved
    OR (
      COALESCE(approval_status, 'pending') = 'pending'
      AND approved_by IS NULL
      AND approved_at IS NULL
    )
  )
);

DROP POLICY "Employees can insert progress on their KPIs" ON public.employee_kpi_progress;

CREATE POLICY "Employees can insert progress on their KPIs"
ON public.employee_kpi_progress FOR INSERT TO authenticated
WITH CHECK (
  kpi_id IN (
    SELECT ek.id
    FROM public.employee_kpis ek
    JOIN public.employees e ON e.id = ek.employee_id
    WHERE e.user_id = auth.uid()
  )
  AND COALESCE(approval_status, 'pending') = 'pending'
  AND approved_by IS NULL
  AND approved_at IS NULL
);