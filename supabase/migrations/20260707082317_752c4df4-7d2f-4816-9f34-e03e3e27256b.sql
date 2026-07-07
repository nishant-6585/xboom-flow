
-- =========================================================
-- 1) compoff_ledger — block employees from self-updating
--    (only Admin/HR can modify ledger rows; employees keep SELECT)
-- =========================================================
DROP POLICY IF EXISTS "Admin/HR update compoff ledger" ON public.compoff_ledger;

CREATE POLICY "Admin/HR update compoff ledger"
ON public.compoff_ledger
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
);

-- Defence-in-depth trigger: reject any non-Admin/HR update to compoff_ledger
CREATE OR REPLACE FUNCTION public.compoff_ledger_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only Admin/HR can modify comp-off ledger rows'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_compoff_ledger_guard ON public.compoff_ledger;
CREATE TRIGGER trg_compoff_ledger_guard
BEFORE UPDATE ON public.compoff_ledger
FOR EACH ROW EXECUTE FUNCTION public.compoff_ledger_guard_self_update();


-- =========================================================
-- 2) employee_kpis — force kpi_source='employee' on self-insert
-- =========================================================
DROP POLICY IF EXISTS "Employees can create their own KPIs" ON public.employee_kpis;

CREATE POLICY "Employees can create their own KPIs"
ON public.employee_kpis
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = employee_kpis.employee_id
      AND e.user_id = auth.uid()
  )
  AND kpi_source = 'employee'::kpi_source
);


-- =========================================================
-- 3) training_assignments — restrict employee self-updates
--    to progress columns only
-- =========================================================
CREATE OR REPLACE FUNCTION public.training_assignment_self_update_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin/HR can change anything
  IF is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Employees may only modify progress-related columns on their own row
  IF NEW.employee_id      IS DISTINCT FROM OLD.employee_id
     OR NEW.training_id    IS DISTINCT FROM OLD.training_id
     OR NEW.training_title IS DISTINCT FROM OLD.training_title
     OR NEW.description    IS DISTINCT FROM OLD.description
     OR NEW.assigned_by    IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_by_name IS DISTINCT FROM OLD.assigned_by_name
     OR NEW.assigned_date  IS DISTINCT FROM OLD.assigned_date
     OR NEW.due_date       IS DISTINCT FROM OLD.due_date
     OR NEW.priority       IS DISTINCT FROM OLD.priority
     OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Employees may only update progress fields (status, progress_percentage, last_accessed, completed_at) on their training assignments'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_training_assignment_self_update ON public.training_assignments;
CREATE TRIGGER trg_training_assignment_self_update
BEFORE UPDATE ON public.training_assignments
FOR EACH ROW EXECUTE FUNCTION public.training_assignment_self_update_check();
