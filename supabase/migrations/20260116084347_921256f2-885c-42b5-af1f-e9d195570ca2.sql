-- Create petty cash transactions table
CREATE TABLE public.petty_cash_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL, -- 'cash_given', 'expense_deduction', 'overpayment_credit', 'refund'
  amount NUMERIC NOT NULL,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add petty cash related columns to expenses
ALTER TABLE public.expenses 
  ADD COLUMN paid_from_petty_cash NUMERIC DEFAULT 0,
  ADD COLUMN amount_paid NUMERIC DEFAULT 0,
  ADD COLUMN payment_notes TEXT;

-- Enable RLS on petty_cash_transactions
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view petty cash transactions
CREATE POLICY "All users can view petty cash transactions"
  ON public.petty_cash_transactions FOR SELECT
  TO authenticated
  USING (true);

-- Only admin/finance can create petty cash transactions
CREATE POLICY "Admin and finance can create petty cash transactions"
  ON public.petty_cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'finance')
    )
    OR user_id = auth.uid()::text -- Users can create their own expense deductions
  );

-- Only admin can delete petty cash transactions
CREATE POLICY "Only admin can delete petty cash transactions"
  ON public.petty_cash_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );