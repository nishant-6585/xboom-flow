
-- Add payment-mode tracking to AR side
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_date DATE;

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS payment_mode TEXT;

-- Centralized CHECK constraint (12 values) on all three payment tables
ALTER TABLE public.payment_records
  DROP CONSTRAINT IF EXISTS payment_records_payment_mode_check;
ALTER TABLE public.payment_records
  ADD CONSTRAINT payment_records_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN (
    'payment_gateway','upi','neft','rtgs','imps','cash','cheque','dd',
    'credit_card','debit_card','bank_transfer','other'
  ));

ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_payment_mode_check;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN (
    'payment_gateway','upi','neft','rtgs','imps','cash','cheque','dd',
    'credit_card','debit_card','bank_transfer','other'
  ));

ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_payment_mode_check;
ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN (
    'payment_gateway','upi','neft','rtgs','imps','cash','cheque','dd',
    'credit_card','debit_card','bank_transfer','other'
  ));

CREATE INDEX IF NOT EXISTS idx_payment_records_payment_mode
  ON public.payment_records (payment_mode)
  WHERE payment_mode IS NOT NULL;

-- View: primary payment mode per order (largest approved payment >=70% share => that mode, else 'mixed')
CREATE OR REPLACE VIEW public.order_primary_payment_mode WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    p.order_id,
    p.payment_mode,
    SUM(p.amount) AS mode_total,
    SUM(SUM(p.amount)) OVER (PARTITION BY p.order_id) AS order_total
  FROM public.payment_records p
  WHERE p.status = 'approved' AND p.payment_mode IS NOT NULL
  GROUP BY p.order_id, p.payment_mode
)
SELECT DISTINCT ON (order_id)
  order_id,
  CASE
    WHEN mode_total >= order_total * 0.7 THEN payment_mode
    ELSE 'mixed'
  END AS primary_payment_mode,
  order_total
FROM agg
ORDER BY order_id, mode_total DESC;

GRANT SELECT ON public.order_primary_payment_mode TO authenticated;

-- Conservative backfill: infer payment_mode from existing notes (only obvious matches)
UPDATE public.payment_records
SET payment_mode = CASE
  WHEN notes ~* '\m(razorpay|payu|gateway)\M' THEN 'payment_gateway'
  WHEN notes ~* '\mupi\M'                     THEN 'upi'
  WHEN notes ~* '\mrtgs\M'                    THEN 'rtgs'
  WHEN notes ~* '\mneft\M'                    THEN 'neft'
  WHEN notes ~* '\mimps\M'                    THEN 'imps'
  WHEN notes ~* '\mcheque\M'                  THEN 'cheque'
  WHEN notes ~* '\mcash\M'                    THEN 'cash'
END
WHERE payment_mode IS NULL
  AND notes IS NOT NULL
  AND notes ~* '\m(razorpay|payu|gateway|upi|rtgs|neft|imps|cheque|cash)\M';
