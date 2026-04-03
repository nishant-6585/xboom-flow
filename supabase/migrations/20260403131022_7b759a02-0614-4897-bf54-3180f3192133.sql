
-- Credit Cards Master Table
CREATE TABLE public.credit_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  billing_cycle_start_date INTEGER NOT NULL DEFAULT 1,
  due_days_after_statement INTEGER NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monthly Statements Table
CREATE TABLE public.cc_monthly_statements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  outstanding_balance NUMERIC NOT NULL DEFAULT 0,
  total_due NUMERIC NOT NULL DEFAULT 0,
  minimum_due NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  available_credit_limit NUMERIC NOT NULL DEFAULT 0,
  interest_charged NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_id, billing_month)
);

-- Transactions Table
CREATE TABLE public.cc_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Misc',
  description TEXT,
  department TEXT,
  campaign_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments Table
CREATE TABLE public.cc_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_type TEXT NOT NULL DEFAULT 'FULL',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_monthly_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin and Finance can read/write
CREATE POLICY "Admin and Finance can view credit cards"
  ON public.credit_cards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can insert credit cards"
  ON public.credit_cards FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can update credit cards"
  ON public.credit_cards FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can delete credit cards"
  ON public.credit_cards FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Statements
CREATE POLICY "Admin and Finance can view statements"
  ON public.cc_monthly_statements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can insert statements"
  ON public.cc_monthly_statements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can update statements"
  ON public.cc_monthly_statements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin can delete statements"
  ON public.cc_monthly_statements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Transactions
CREATE POLICY "Admin and Finance can view transactions"
  ON public.cc_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can insert transactions"
  ON public.cc_transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can update transactions"
  ON public.cc_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin can delete transactions"
  ON public.cc_transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Payments
CREATE POLICY "Admin and Finance can view payments"
  ON public.cc_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can insert payments"
  ON public.cc_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin and Finance can update payments"
  ON public.cc_payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin can delete payments"
  ON public.cc_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
