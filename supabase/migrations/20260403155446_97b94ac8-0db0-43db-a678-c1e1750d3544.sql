
-- Create cc_transactions table for transaction-level tracking
CREATE TABLE public.cc_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES public.cc_statements(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'debit' CHECK (transaction_type IN ('debit', 'credit', 'fee', 'interest', 'payment', 'refund', 'emi', 'cashback')),
  amount NUMERIC NOT NULL DEFAULT 0,
  merchant_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cc_payments table for payment tracking with history
CREATE TABLE public.cc_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id UUID NOT NULL REFERENCES public.cc_statements(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'other' CHECK (payment_mode IN ('upi', 'neft', 'rtgs', 'cheque', 'cash', 'auto_debit', 'card', 'other')),
  reference_number TEXT,
  notes TEXT,
  recorded_by UUID NOT NULL,
  recorded_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add unique constraint on cc_statements for upsert support (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cc_statements_card_id_billing_month_key'
  ) THEN
    ALTER TABLE public.cc_statements ADD CONSTRAINT cc_statements_card_id_billing_month_key UNIQUE (card_id, billing_month);
  END IF;
END $$;

-- Indexes
CREATE INDEX idx_cc_transactions_statement ON public.cc_transactions(statement_id);
CREATE INDEX idx_cc_transactions_card ON public.cc_transactions(card_id);
CREATE INDEX idx_cc_transactions_date ON public.cc_transactions(transaction_date);
CREATE INDEX idx_cc_payments_statement ON public.cc_payments(statement_id);
CREATE INDEX idx_cc_payments_card ON public.cc_payments(card_id);

-- Enable RLS
ALTER TABLE public.cc_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for cc_transactions (admin + finance only)
CREATE POLICY "Admin/finance can view transactions"
  ON public.cc_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin/finance can insert transactions"
  ON public.cc_transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin/finance can update transactions"
  ON public.cc_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin/finance can delete transactions"
  ON public.cc_transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- RLS policies for cc_payments (admin + finance only)
CREATE POLICY "Admin/finance can view payments"
  ON public.cc_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin/finance can insert payments"
  ON public.cc_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin/finance can update payments"
  ON public.cc_payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Admin/finance can delete payments"
  ON public.cc_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Trigger for updated_at on cc_payments
CREATE TRIGGER update_cc_payments_updated_at
  BEFORE UPDATE ON public.cc_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-sync payment totals to cc_statements
CREATE OR REPLACE FUNCTION public.sync_cc_payment_to_statement()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_total_paid NUMERIC;
  v_total_due NUMERIC;
  v_minimum_due NUMERIC;
  v_new_status TEXT;
  v_stmt_id UUID;
BEGIN
  v_stmt_id := COALESCE(NEW.statement_id, OLD.statement_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM public.cc_payments
  WHERE statement_id = v_stmt_id;

  SELECT COALESCE(total_due, 0), COALESCE(minimum_due, 0)
  INTO v_total_due, v_minimum_due
  FROM public.cc_statements
  WHERE id = v_stmt_id;

  IF v_total_paid >= v_total_due AND v_total_due > 0 THEN
    v_new_status := 'FULL';
  ELSIF v_total_paid >= v_minimum_due AND v_minimum_due > 0 THEN
    v_new_status := 'PARTIAL';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'UNPAID';
  END IF;

  UPDATE public.cc_statements
  SET amount_paid = v_total_paid,
      payment_status = v_new_status,
      updated_at = now()
  WHERE id = v_stmt_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_cc_payment_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.cc_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_cc_payment_to_statement();
