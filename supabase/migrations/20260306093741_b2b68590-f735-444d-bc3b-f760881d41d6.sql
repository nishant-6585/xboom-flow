
-- Create payroll_payment_status table
CREATE TABLE public.payroll_payment_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salary_sheet_id UUID NOT NULL REFERENCES public.salary_sheets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  bank_account TEXT,
  ifsc_code TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  bank_reference_number TEXT,
  updated_by UUID,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'paid', 'failed'))
);

-- Enable RLS
ALTER TABLE public.payroll_payment_status ENABLE ROW LEVEL SECURITY;

-- Finance, HR, Admin can view
CREATE POLICY "hr_finance_admin_select_payment_status"
  ON public.payroll_payment_status FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'finance'
  ));

-- Finance, Admin can insert
CREATE POLICY "finance_admin_insert_payment_status"
  ON public.payroll_payment_status FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'finance'
  ));

-- Finance, Admin can update
CREATE POLICY "finance_admin_update_payment_status"
  ON public.payroll_payment_status FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('finance', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('finance', 'admin')
  ));

-- Index for fast lookups
CREATE INDEX idx_payroll_payment_status_sheet ON public.payroll_payment_status(salary_sheet_id);
CREATE INDEX idx_payroll_payment_status_employee ON public.payroll_payment_status(employee_id);
