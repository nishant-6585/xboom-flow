
-- Create payroll_transfer_files table
CREATE TABLE public.payroll_transfer_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salary_sheet_id UUID NOT NULL REFERENCES public.salary_sheets(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL,
  generated_by_name TEXT NOT NULL,
  file_url TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payroll_transfer_files ENABLE ROW LEVEL SECURITY;

-- HR, Finance, Admin can view
CREATE POLICY "hr_finance_admin_select_transfer_files"
  ON public.payroll_transfer_files FOR SELECT TO authenticated
  USING (public.is_hr_or_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'finance'
  ));

-- HR, Finance, Admin can insert
CREATE POLICY "hr_finance_admin_insert_transfer_files"
  ON public.payroll_transfer_files FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_or_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'finance'
  ));

-- Create storage bucket for payroll transfer files
INSERT INTO storage.buckets (id, name, public) VALUES ('payroll_transfers', 'payroll_transfers', false);

-- Storage RLS: HR/Finance/Admin can upload
CREATE POLICY "hr_finance_upload_payroll_transfers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payroll_transfers' AND (
    public.is_hr_or_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'finance'
    )
  ));

-- Storage RLS: HR/Finance/Admin can read
CREATE POLICY "hr_finance_read_payroll_transfers"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payroll_transfers' AND (
    public.is_hr_or_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'finance'
    )
  ));
