
CREATE TABLE IF NOT EXISTS public.invoice_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NULL,
  woocommerce_order_id UUID NULL,
  invoice_id UUID NOT NULL REFERENCES public.order_invoices(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('proforma','tax_invoice')),
  to_email TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  bypass_reason TEXT NULL,
  error TEXT NULL,
  sent_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_email_log_invoice ON public.invoice_email_log(invoice_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_email_log_order ON public.invoice_email_log(order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_email_log_woo ON public.invoice_email_log(woocommerce_order_id);

GRANT SELECT, INSERT ON public.invoice_email_log TO authenticated;
GRANT ALL ON public.invoice_email_log TO service_role;

ALTER TABLE public.invoice_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view invoice email logs"
  ON public.invoice_email_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert invoice email logs"
  ON public.invoice_email_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins/finance can update invoice email logs"
  ON public.invoice_email_log FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE POLICY "Admins/finance can delete invoice email logs"
  ON public.invoice_email_log FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
