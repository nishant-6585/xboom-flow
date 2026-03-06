-- Add KPI source (who created it) and workflow status columns
CREATE TYPE public.kpi_source AS ENUM ('hr', 'employee');
CREATE TYPE public.kpi_workflow_status AS ENUM ('draft', 'active', 'completed', 'reviewed');

ALTER TABLE public.employee_kpis
  ADD COLUMN kpi_source public.kpi_source NOT NULL DEFAULT 'hr',
  ADD COLUMN workflow_status public.kpi_workflow_status NOT NULL DEFAULT 'active';

-- Allow employees to INSERT their own KPIs
CREATE POLICY "Employees can create their own KPIs"
ON public.employee_kpis
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  )
);

-- Allow employees to UPDATE their own self-created KPIs
CREATE POLICY "Employees can update their own KPIs"
ON public.employee_kpis
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  )
  AND kpi_source = 'employee'
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  )
  AND kpi_source = 'employee'
);

-- Allow employees to DELETE only their own self-created KPIs
CREATE POLICY "Employees can delete their own self-created KPIs"
ON public.employee_kpis
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.user_id = auth.uid()
  )
  AND kpi_source = 'employee'
);