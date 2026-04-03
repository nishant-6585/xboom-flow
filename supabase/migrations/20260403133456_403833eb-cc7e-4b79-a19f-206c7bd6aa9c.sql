
ALTER TABLE public.cc_monthly_statements 
  ADD COLUMN IF NOT EXISTS last_statement_due numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS late_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;
