
-- Create salary sheet status enum
CREATE TYPE public.salary_sheet_status AS ENUM ('draft', 'locked');

-- Create salary_sheets table
CREATE TABLE public.salary_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  status salary_sheet_status NOT NULL DEFAULT 'draft',
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, year)
);

-- Create salary_sheet_entries table
CREATE TABLE public.salary_sheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_sheet_id UUID NOT NULL REFERENCES public.salary_sheets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  salary NUMERIC NOT NULL DEFAULT 0,
  bank_account TEXT,
  ifsc_code TEXT,
  wfh_days INTEGER NOT NULL DEFAULT 0,
  unpaid_leaves INTEGER NOT NULL DEFAULT 0,
  el_leaves INTEGER NOT NULL DEFAULT 0,
  sl_leaves INTEGER NOT NULL DEFAULT 0,
  deductions NUMERIC NOT NULL DEFAULT 0,
  pending_amount NUMERIC NOT NULL DEFAULT 0,
  tds NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  reimbursements NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (salary_sheet_id, employee_id)
);

-- Enable RLS
ALTER TABLE public.salary_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_sheet_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies: HR and Admin only
CREATE POLICY "HR/Admin can view salary sheets"
  ON public.salary_sheets FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can insert salary sheets"
  ON public.salary_sheets FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can update salary sheets"
  ON public.salary_sheets FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can delete salary sheets"
  ON public.salary_sheets FOR DELETE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) AND status = 'draft');

CREATE POLICY "HR/Admin can view salary entries"
  ON public.salary_sheet_entries FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can insert salary entries"
  ON public.salary_sheet_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can update salary entries"
  ON public.salary_sheet_entries FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

CREATE POLICY "HR/Admin can delete salary entries"
  ON public.salary_sheet_entries FOR DELETE TO authenticated
  USING (public.is_hr_or_admin(auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_salary_sheets_updated_at
  BEFORE UPDATE ON public.salary_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_salary_sheet_entries_updated_at
  BEFORE UPDATE ON public.salary_sheet_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
