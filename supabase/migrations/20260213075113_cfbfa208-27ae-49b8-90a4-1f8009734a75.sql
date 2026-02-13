
-- Create measurement unit enum
CREATE TYPE public.kpi_measurement_unit AS ENUM ('percentage', 'numeric', 'currency', 'count', 'rating', 'boolean');

-- Create KPI priority enum
CREATE TYPE public.kpi_priority AS ENUM ('low', 'medium', 'high');

-- Create KPI RAG status enum
CREATE TYPE public.kpi_rag_status AS ENUM ('green', 'amber', 'red', 'not_started');

-- Create employee_kpis table (KPI definitions assigned by Admin/HR)
CREATE TABLE public.employee_kpis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  target_value NUMERIC NOT NULL,
  measurement_unit kpi_measurement_unit NOT NULL DEFAULT 'numeric',
  weightage NUMERIC NOT NULL DEFAULT 1 CHECK (weightage > 0 AND weightage <= 100),
  department TEXT,
  priority kpi_priority NOT NULL DEFAULT 'medium',
  due_date DATE NOT NULL,
  green_threshold NUMERIC NOT NULL DEFAULT 90,
  amber_threshold NUMERIC NOT NULL DEFAULT 70,
  status kpi_rag_status NOT NULL DEFAULT 'not_started',
  achieved_value NUMERIC DEFAULT 0,
  achievement_percentage NUMERIC DEFAULT 0,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create employee_kpi_progress table (progress updates by employees)
CREATE TABLE public.employee_kpi_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id UUID NOT NULL REFERENCES public.employee_kpis(id) ON DELETE CASCADE,
  achieved_value NUMERIC NOT NULL,
  progress_notes TEXT,
  attachment_url TEXT,
  updated_by UUID NOT NULL,
  updated_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create employee_roles_responsibilities table
CREATE TABLE public.employee_roles_responsibilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  responsibilities TEXT NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_kpi_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_roles_responsibilities ENABLE ROW LEVEL SECURITY;

-- RLS for employee_kpis
CREATE POLICY "HR/Admin can manage all KPIs"
ON public.employee_kpis
FOR ALL
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Employees can view their own KPIs"
ON public.employee_kpis
FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- RLS for employee_kpi_progress
CREATE POLICY "HR/Admin can view all progress"
ON public.employee_kpi_progress
FOR SELECT
USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Employees can view and insert their own KPI progress"
ON public.employee_kpi_progress
FOR SELECT
USING (
  kpi_id IN (
    SELECT ek.id FROM public.employee_kpis ek
    JOIN public.employees e ON e.id = ek.employee_id
    WHERE e.user_id = auth.uid()
  )
);

CREATE POLICY "Employees can insert progress on their KPIs"
ON public.employee_kpi_progress
FOR INSERT
WITH CHECK (
  kpi_id IN (
    SELECT ek.id FROM public.employee_kpis ek
    JOIN public.employees e ON e.id = ek.employee_id
    WHERE e.user_id = auth.uid()
  )
);

CREATE POLICY "HR/Admin can insert progress"
ON public.employee_kpi_progress
FOR INSERT
WITH CHECK (public.is_hr_or_admin(auth.uid()));

-- RLS for employee_roles_responsibilities
CREATE POLICY "HR/Admin can manage all roles & responsibilities"
ON public.employee_roles_responsibilities
FOR ALL
USING (public.is_hr_or_admin(auth.uid()))
WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "Employees can view their own roles & responsibilities"
ON public.employee_roles_responsibilities
FOR SELECT
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Triggers for updated_at
CREATE TRIGGER update_employee_kpis_updated_at
BEFORE UPDATE ON public.employee_kpis
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_roles_responsibilities_updated_at
BEFORE UPDATE ON public.employee_roles_responsibilities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-calculate RAG status and achievement on progress update
CREATE OR REPLACE FUNCTION public.update_kpi_on_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target NUMERIC;
  v_green NUMERIC;
  v_amber NUMERIC;
  v_due DATE;
  v_pct NUMERIC;
  v_status kpi_rag_status;
BEGIN
  -- Get KPI details
  SELECT target_value, green_threshold, amber_threshold, due_date
  INTO v_target, v_green, v_amber, v_due
  FROM public.employee_kpis
  WHERE id = NEW.kpi_id;

  -- Calculate achievement percentage
  IF v_target > 0 THEN
    v_pct := (NEW.achieved_value / v_target) * 100;
  ELSE
    v_pct := 0;
  END IF;

  -- Determine RAG status
  IF v_pct >= v_green THEN
    v_status := 'green';
  ELSIF v_pct >= v_amber THEN
    v_status := 'amber';
  ELSIF CURRENT_DATE > v_due THEN
    v_status := 'red';
  ELSE
    v_status := 'amber';
  END IF;

  -- Update KPI record
  UPDATE public.employee_kpis
  SET achieved_value = NEW.achieved_value,
      achievement_percentage = v_pct,
      status = v_status,
      updated_at = now()
  WHERE id = NEW.kpi_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_kpi_on_progress
AFTER INSERT ON public.employee_kpi_progress
FOR EACH ROW EXECUTE FUNCTION public.update_kpi_on_progress();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_kpis;
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_kpi_progress;
