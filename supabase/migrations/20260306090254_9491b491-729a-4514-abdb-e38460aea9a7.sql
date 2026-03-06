
-- 1. Add salary/bank fields to employees table
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS monthly_salary numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS ifsc_code text,
  ADD COLUMN IF NOT EXISTS designation text;

-- 2. Create salary_history table
CREATE TABLE IF NOT EXISTS public.salary_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  salary numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR/Admin can manage salary_history"
  ON public.salary_history
  FOR ALL
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()))
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

-- 3. Create employee_payslips table
CREATE TABLE IF NOT EXISTS public.employee_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  salary_sheet_id uuid NOT NULL REFERENCES public.salary_sheets(id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  pdf_url text NOT NULL,
  generated_by uuid,
  generated_by_name text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, salary_sheet_id)
);

ALTER TABLE public.employee_payslips ENABLE ROW LEVEL SECURITY;

-- HR/Admin can manage all payslips
CREATE POLICY "HR/Admin can manage payslips"
  ON public.employee_payslips
  FOR ALL
  TO authenticated
  USING (public.is_hr_or_admin(auth.uid()))
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

-- Employees can view their own payslips
CREATE POLICY "Employees can view own payslips"
  ON public.employee_payslips
  FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

-- 4. Create payslips storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payslips', 'payslips', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: HR/Admin can upload
CREATE POLICY "HR/Admin can upload payslips"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payslips' AND public.is_hr_or_admin(auth.uid())
  );

-- Storage RLS: HR/Admin can read all, employees can read own
CREATE POLICY "Authenticated can read payslips"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payslips' AND (
      public.is_hr_or_admin(auth.uid())
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );
