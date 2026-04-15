
CREATE TABLE public.recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_name TEXT NOT NULL,
  vendor_name TEXT,
  account_id UUID REFERENCES public.reconciliation_accounts(id),
  subaccount_id UUID REFERENCES public.reconciliation_subaccounts(id),
  default_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_paid_date DATE,
  last_paid_amount NUMERIC(15,2),
  last_linked_transaction_id UUID REFERENCES public.bank_transactions(id),
  next_due_date DATE,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/admin can manage recurring_expenses"
  ON public.recurring_expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE INDEX idx_recurring_expenses_next_due ON public.recurring_expenses(next_due_date);
CREATE INDEX idx_recurring_expenses_active ON public.recurring_expenses(is_active);

CREATE TRIGGER update_recurring_expenses_updated_at
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
