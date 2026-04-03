
-- Phase 1: Drop all old tables (order matters for FK dependencies)
DROP TABLE IF EXISTS public.cc_transactions CASCADE;
DROP TABLE IF EXISTS public.cc_payments CASCADE;
DROP TABLE IF EXISTS public.cc_monthly_statements CASCADE;
DROP TABLE IF EXISTS public.statement_uploads CASCADE;
DROP TABLE IF EXISTS public.credit_cards CASCADE;

-- Phase 2: Create new schema

-- 1. credit_cards (auto-created by AI)
CREATE TABLE public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_name, bank_name)
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_finance_select_cards" ON public.credit_cards
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "admin_finance_insert_cards" ON public.credit_cards
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "admin_finance_update_cards" ON public.credit_cards
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- 2. cc_statements
CREATE TABLE public.cc_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  due_date DATE NOT NULL,
  outstanding_balance NUMERIC NOT NULL DEFAULT 0,
  total_due NUMERIC NOT NULL DEFAULT 0,
  minimum_due NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  payment_date DATE,
  interest_charged NUMERIC NOT NULL DEFAULT 0,
  late_fee NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  available_credit_limit NUMERIC NOT NULL DEFAULT 0,
  upload_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_id, billing_month)
);

ALTER TABLE public.cc_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_finance_select_stmts" ON public.cc_statements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "admin_finance_insert_stmts" ON public.cc_statements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "admin_finance_update_stmts" ON public.cc_statements
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- 3. statement_uploads
CREATE TABLE public.statement_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  detected_bank TEXT,
  detected_card_name TEXT,
  card_id UUID REFERENCES public.credit_cards(id),
  statement_id UUID REFERENCES public.cc_statements(id),
  uploaded_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROCESSING',
  confidence_score NUMERIC,
  parsed_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.statement_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_finance_select_uploads" ON public.statement_uploads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "admin_finance_insert_uploads" ON public.statement_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "admin_finance_update_uploads" ON public.statement_uploads
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Add FK back-reference
ALTER TABLE public.cc_statements
  ADD CONSTRAINT cc_statements_upload_id_fkey
  FOREIGN KEY (upload_id) REFERENCES public.statement_uploads(id);

-- Storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cc-statements', 'cc-statements', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop old if exist, then create)
DROP POLICY IF EXISTS "Admin/Finance can upload cc statements" ON storage.objects;
DROP POLICY IF EXISTS "Admin/Finance can read cc statements" ON storage.objects;

CREATE POLICY "cc_stmt_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cc-statements'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  );

CREATE POLICY "cc_stmt_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cc-statements'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  );
