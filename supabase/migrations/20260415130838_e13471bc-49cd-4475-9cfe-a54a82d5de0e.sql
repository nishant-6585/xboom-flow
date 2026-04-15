
-- Account masters
CREATE TABLE public.reconciliation_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  account_type TEXT NOT NULL DEFAULT 'both' CHECK (account_type IN ('credit', 'debit', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/admin can manage reconciliation_accounts"
  ON public.reconciliation_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Subaccount masters
CREATE TABLE public.reconciliation_subaccounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.reconciliation_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_id, name)
);

ALTER TABLE public.reconciliation_subaccounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/admin can manage reconciliation_subaccounts"
  ON public.reconciliation_subaccounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Upload tracking
CREATE TABLE public.bank_reconciliation_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv', 'xlsx')),
  bank_name TEXT,
  account_number TEXT,
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'processing', 'completed', 'failed')),
  parsed_count INTEGER DEFAULT 0,
  error_message TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_reconciliation_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/admin can manage uploads"
  ON public.bank_reconciliation_uploads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Bank transactions
CREATE TABLE public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID REFERENCES public.bank_reconciliation_uploads(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  value_date DATE,
  bank_reference TEXT,
  narration TEXT,
  credit_amount NUMERIC(15,2) DEFAULT 0,
  debit_amount NUMERIC(15,2) DEFAULT 0,
  running_balance NUMERIC(15,2),
  transaction_type TEXT NOT NULL DEFAULT 'unknown' CHECK (transaction_type IN ('credit', 'debit', 'unknown')),
  account_id UUID REFERENCES public.reconciliation_accounts(id),
  subaccount_id UUID REFERENCES public.reconciliation_subaccounts(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'auto_matched', 'pending_review', 'reconciled', 'partially_reconciled', 'unmatched', 'ignored', 'duplicate')),
  internal_reference TEXT,
  notes TEXT,
  matched_entity_type TEXT,
  matched_entity_id TEXT,
  match_confidence NUMERIC(5,2),
  matched_by TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/admin can manage bank_transactions"
  ON public.bank_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE INDEX idx_bank_transactions_upload ON public.bank_transactions(upload_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(transaction_date);
CREATE INDEX idx_bank_transactions_status ON public.bank_transactions(status);
CREATE INDEX idx_bank_transactions_type ON public.bank_transactions(transaction_type);

-- Auto-categorization rules
CREATE TABLE public.reconciliation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES public.reconciliation_accounts(id),
  subaccount_id UUID REFERENCES public.reconciliation_subaccounts(id),
  suggested_category TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/admin can manage reconciliation_rules"
  ON public.reconciliation_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Triggers for updated_at
CREATE TRIGGER update_reconciliation_accounts_updated_at
  BEFORE UPDATE ON public.reconciliation_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reconciliation_subaccounts_updated_at
  BEFORE UPDATE ON public.reconciliation_subaccounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bank_reconciliation_uploads_updated_at
  BEFORE UPDATE ON public.bank_reconciliation_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed accounts
INSERT INTO public.reconciliation_accounts (id, name, description, account_type) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Sales / Revenue', 'Income from product sales, services, and customer payments', 'credit'),
  ('a0000001-0000-0000-0000-000000000002', 'Procurement', 'Payments to suppliers and vendors for inventory and materials', 'debit'),
  ('a0000001-0000-0000-0000-000000000003', 'Expense', 'Operational and administrative expenses', 'debit'),
  ('a0000001-0000-0000-0000-000000000004', 'Finance / Loan', 'Loan repayments, EMIs, and interest payments', 'debit'),
  ('a0000001-0000-0000-0000-000000000005', 'Tax / Compliance', 'Tax payments and compliance-related transactions', 'debit'),
  ('a0000001-0000-0000-0000-000000000006', 'Transfer', 'Internal fund transfers between accounts', 'both'),
  ('a0000001-0000-0000-0000-000000000007', 'Adjustment', 'Manual adjustments, reversals, and corrections', 'both');

-- Seed subaccounts: Expense
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000003', 'Courier / Logistics'),
  ('a0000001-0000-0000-0000-000000000003', 'Rent'),
  ('a0000001-0000-0000-0000-000000000003', 'Salaries'),
  ('a0000001-0000-0000-0000-000000000003', 'Marketing'),
  ('a0000001-0000-0000-0000-000000000003', 'Travel'),
  ('a0000001-0000-0000-0000-000000000003', 'Office Expense'),
  ('a0000001-0000-0000-0000-000000000003', 'Food'),
  ('a0000001-0000-0000-0000-000000000003', 'Utilities'),
  ('a0000001-0000-0000-0000-000000000003', 'Bank Charges'),
  ('a0000001-0000-0000-0000-000000000003', 'Payment Gateway Charges'),
  ('a0000001-0000-0000-0000-000000000003', 'Software'),
  ('a0000001-0000-0000-0000-000000000003', 'Repairs'),
  ('a0000001-0000-0000-0000-000000000003', 'Professional Fees');

-- Seed subaccounts: Procurement
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000002', 'Inventory Purchase'),
  ('a0000001-0000-0000-0000-000000000002', 'Drone Purchase'),
  ('a0000001-0000-0000-0000-000000000002', 'Battery Purchase'),
  ('a0000001-0000-0000-0000-000000000002', 'Accessory Purchase'),
  ('a0000001-0000-0000-0000-000000000002', 'Packaging Material'),
  ('a0000001-0000-0000-0000-000000000002', 'Spare Parts'),
  ('a0000001-0000-0000-0000-000000000002', 'Import Procurement'),
  ('a0000001-0000-0000-0000-000000000002', 'Vendor Advance'),
  ('a0000001-0000-0000-0000-000000000002', 'Freight Inward'),
  ('a0000001-0000-0000-0000-000000000002', 'Customs & Clearance');

-- Seed subaccounts: Sales / Revenue
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Product Sales'),
  ('a0000001-0000-0000-0000-000000000001', 'Institutional Sales'),
  ('a0000001-0000-0000-0000-000000000001', 'Website Orders'),
  ('a0000001-0000-0000-0000-000000000001', 'Marketplace Orders'),
  ('a0000001-0000-0000-0000-000000000001', 'Training Revenue'),
  ('a0000001-0000-0000-0000-000000000001', 'Service Revenue'),
  ('a0000001-0000-0000-0000-000000000001', 'Advance from Customer'),
  ('a0000001-0000-0000-0000-000000000001', 'Partial Payment Received'),
  ('a0000001-0000-0000-0000-000000000001', 'Final Payment Received');

-- Seed subaccounts: Finance / Loan
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000004', 'EMI'),
  ('a0000001-0000-0000-0000-000000000004', 'Loan Repayment'),
  ('a0000001-0000-0000-0000-000000000004', 'Interest'),
  ('a0000001-0000-0000-0000-000000000004', 'Credit Card Payment');

-- Seed subaccounts: Tax
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000005', 'GST Payment'),
  ('a0000001-0000-0000-0000-000000000005', 'TDS Payment'),
  ('a0000001-0000-0000-0000-000000000005', 'Income Tax'),
  ('a0000001-0000-0000-0000-000000000005', 'Professional Tax');

-- Seed subaccounts: Transfer
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000006', 'Self Transfer'),
  ('a0000001-0000-0000-0000-000000000006', 'Inter-Bank Transfer'),
  ('a0000001-0000-0000-0000-000000000006', 'FD / Investment');

-- Seed subaccounts: Adjustment
INSERT INTO public.reconciliation_subaccounts (account_id, name) VALUES
  ('a0000001-0000-0000-0000-000000000007', 'Reversal'),
  ('a0000001-0000-0000-0000-000000000007', 'Correction'),
  ('a0000001-0000-0000-0000-000000000007', 'Write-Off');

-- Seed auto-categorization rules
INSERT INTO public.reconciliation_rules (keyword, account_id, subaccount_id, suggested_category, priority) VALUES
  ('payu', 'a0000001-0000-0000-0000-000000000001', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Product Sales' AND account_id='a0000001-0000-0000-0000-000000000001'), 'Sales / Revenue > Product Sales', 10),
  ('easebuzz', 'a0000001-0000-0000-0000-000000000001', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Product Sales' AND account_id='a0000001-0000-0000-0000-000000000001'), 'Sales / Revenue > Product Sales', 10),
  ('razorpay', 'a0000001-0000-0000-0000-000000000001', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Product Sales' AND account_id='a0000001-0000-0000-0000-000000000001'), 'Sales / Revenue > Product Sales', 10),
  ('shiprocket', 'a0000001-0000-0000-0000-000000000003', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Courier / Logistics' AND account_id='a0000001-0000-0000-0000-000000000003'), 'Expense > Courier / Logistics', 8),
  ('delhivery', 'a0000001-0000-0000-0000-000000000003', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Courier / Logistics' AND account_id='a0000001-0000-0000-0000-000000000003'), 'Expense > Courier / Logistics', 8),
  ('rent', 'a0000001-0000-0000-0000-000000000003', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Rent' AND account_id='a0000001-0000-0000-0000-000000000003'), 'Expense > Rent', 5),
  ('salary', 'a0000001-0000-0000-0000-000000000003', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Salaries' AND account_id='a0000001-0000-0000-0000-000000000003'), 'Expense > Salaries', 7),
  ('emi', 'a0000001-0000-0000-0000-000000000004', (SELECT id FROM public.reconciliation_subaccounts WHERE name='EMI' AND account_id='a0000001-0000-0000-0000-000000000004'), 'Finance / Loan > EMI', 9),
  ('loan', 'a0000001-0000-0000-0000-000000000004', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Loan Repayment' AND account_id='a0000001-0000-0000-0000-000000000004'), 'Finance / Loan > Loan Repayment', 7),
  ('customs', 'a0000001-0000-0000-0000-000000000002', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Customs & Clearance' AND account_id='a0000001-0000-0000-0000-000000000002'), 'Procurement > Customs & Clearance', 8),
  ('self transfer', 'a0000001-0000-0000-0000-000000000006', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Self Transfer' AND account_id='a0000001-0000-0000-0000-000000000006'), 'Transfer > Self Transfer', 6),
  ('neft self', 'a0000001-0000-0000-0000-000000000006', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Self Transfer' AND account_id='a0000001-0000-0000-0000-000000000006'), 'Transfer > Self Transfer', 6),
  ('gst', 'a0000001-0000-0000-0000-000000000005', (SELECT id FROM public.reconciliation_subaccounts WHERE name='GST Payment' AND account_id='a0000001-0000-0000-0000-000000000005'), 'Tax / Compliance > GST Payment', 8),
  ('tds', 'a0000001-0000-0000-0000-000000000005', (SELECT id FROM public.reconciliation_subaccounts WHERE name='TDS Payment' AND account_id='a0000001-0000-0000-0000-000000000005'), 'Tax / Compliance > TDS Payment', 8),
  ('amazon', 'a0000001-0000-0000-0000-000000000001', (SELECT id FROM public.reconciliation_subaccounts WHERE name='Marketplace Orders' AND account_id='a0000001-0000-0000-0000-000000000001'), 'Sales / Revenue > Marketplace Orders', 7);

-- Storage bucket for bank statements
INSERT INTO storage.buckets (id, name, public) VALUES ('bank-statements', 'bank-statements', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Finance/admin can upload bank statements"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bank-statements' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')));

CREATE POLICY "Finance/admin can view bank statements"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bank-statements' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')));

CREATE POLICY "Finance/admin can delete bank statements"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bank-statements' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')));
