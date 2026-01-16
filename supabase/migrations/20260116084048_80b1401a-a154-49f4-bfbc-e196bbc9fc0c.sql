-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  vendor_name TEXT,
  receipt_url TEXT,
  payment_mode TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view expenses
CREATE POLICY "All users can view expenses"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can create expenses
CREATE POLICY "All users can create expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update their own pending expenses, admin/finance can update any
CREATE POLICY "Users can update own expenses or admin/finance can update any"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()::text 
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'finance')
    )
  );

-- Only admin can delete expenses
CREATE POLICY "Only admin can delete expenses"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Create updated_at trigger
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();