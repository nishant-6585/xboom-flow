ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_number ON public.orders(invoice_number) WHERE invoice_number IS NOT NULL;