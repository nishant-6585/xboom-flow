-- 1) Zoho poller onConflict fix: recreate uq index without partial predicate
--    so upsert(onConflict:'zoho_invoice_id') matches. Rows with NULL
--    zoho_invoice_id are still allowed (PG unique treats NULLs as distinct).
DROP INDEX IF EXISTS public.uq_order_invoices_zoho_invoice_id;
CREATE UNIQUE INDEX uq_order_invoices_zoho_invoice_id
  ON public.order_invoices (zoho_invoice_id);

-- 2) KYC status truth: correlate log rows to email_send_log by idempotency key.
ALTER TABLE public.kyc_email_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_kyc_email_log_idem
  ON public.kyc_email_log (idempotency_key);
