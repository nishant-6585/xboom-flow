
-- ==========================================
-- FEATURE 1: Employment History Table
-- ==========================================

CREATE TABLE public.employment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('INTERN', 'FULL_TIME', 'CONTRACT')),
  salary NUMERIC,
  stipend NUMERIC,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by UUID,
  created_by_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Only one active (no end date) record per employee
CREATE UNIQUE INDEX one_active_employment_per_employee
ON public.employment_history(employee_id)
WHERE effective_to IS NULL;

-- Auto-close previous active employment on new insert
CREATE OR REPLACE FUNCTION public.close_previous_employment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.employment_history
  SET effective_to = NEW.effective_from - INTERVAL '1 day'
  WHERE employee_id = NEW.employee_id
    AND effective_to IS NULL
    AND id != NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER trg_close_previous_employment
BEFORE INSERT ON public.employment_history
FOR EACH ROW
EXECUTE FUNCTION public.close_previous_employment();

-- RLS
ALTER TABLE public.employment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and HR can manage employment history"
ON public.employment_history
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
);

CREATE POLICY "Employees can view own employment history"
ON public.employment_history
FOR SELECT
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- ==========================================
-- FEATURE 2: Payroll Automation
-- ==========================================

-- Generate salary sheets function (idempotent)
CREATE OR REPLACE FUNCTION public.generate_salary_sheets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Prevent duplicate
  IF EXISTS (
    SELECT 1 FROM public.salary_sheets
    WHERE month = EXTRACT(MONTH FROM CURRENT_DATE)
      AND year = EXTRACT(YEAR FROM CURRENT_DATE)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.salary_sheets (id, month, year, status, created_by, created_by_name, created_at)
  VALUES (
    gen_random_uuid(),
    EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    'draft',
    '00000000-0000-0000-0000-000000000000'::UUID,
    'System (Auto)',
    now()
  );
END;
$$;

-- Prevent edits to locked salary sheets
CREATE OR REPLACE FUNCTION public.prevent_edit_locked_sheet()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    RAISE EXCEPTION 'Cannot modify a locked salary sheet';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER trg_prevent_edit_locked
BEFORE UPDATE ON public.salary_sheets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_edit_locked_sheet();
