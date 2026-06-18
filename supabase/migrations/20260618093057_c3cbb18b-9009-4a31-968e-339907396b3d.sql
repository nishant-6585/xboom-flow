
-- Extend order_invoices for source/document type + GST snapshot
ALTER TABLE public.order_invoices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'zoho',
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'tax_invoice',
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS tax_amount numeric,
  ADD COLUMN IF NOT EXISTS total numeric,
  ADD COLUMN IF NOT EXISTS amount_paid numeric,
  ADD COLUMN IF NOT EXISTS place_of_supply text,
  ADD COLUMN IF NOT EXISTS gst_treatment text,
  ADD COLUMN IF NOT EXISTS tax_breakup jsonb;

-- Validation triggers (not CHECK constraints, per project rules)
CREATE OR REPLACE FUNCTION public.validate_order_invoice_enums()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.source NOT IN ('xboom','zoho') THEN
    RAISE EXCEPTION 'source must be xboom or zoho, got %', NEW.source;
  END IF;
  IF NEW.document_type NOT IN ('proforma','tax_invoice') THEN
    RAISE EXCEPTION 'document_type must be proforma or tax_invoice, got %', NEW.document_type;
  END IF;
  IF NEW.gst_treatment IS NOT NULL AND NEW.gst_treatment NOT IN ('igst','cgst_sgst') THEN
    RAISE EXCEPTION 'gst_treatment must be igst or cgst_sgst, got %', NEW.gst_treatment;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_order_invoice_enums ON public.order_invoices;
CREATE TRIGGER trg_validate_order_invoice_enums
  BEFORE INSERT OR UPDATE ON public.order_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_invoice_enums();

-- Proforma number sequence + RPC
CREATE SEQUENCE IF NOT EXISTS public.proforma_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.get_next_proforma_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'XPF-' || to_char(now() AT TIME ZONE 'Asia/Kolkata','YYMM') ||
         '-' || lpad(nextval('public.proforma_number_seq')::text, 4, '0');
$$;

GRANT EXECUTE ON FUNCTION public.get_next_proforma_number() TO authenticated;
