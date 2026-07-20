ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_payment_mode_check;
ALTER TABLE public.payment_records ADD CONSTRAINT payment_records_payment_mode_check
  CHECK (
    payment_mode IS NULL OR payment_mode = ANY (ARRAY[
      'payment_gateway','upi','neft','rtgs','imps','cash','cheque','dd',
      'credit_card','debit_card','bank_transfer','bajaj_finserv','snapmint','other'
    ])
  );