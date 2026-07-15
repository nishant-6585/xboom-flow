-- Harden invoices self-update column lock: include signed_at (previously omitted)
-- so non-privileged owners (creator/signer/submitter allowed by RLS) cannot
-- self-approve financial or signature-related fields on their own invoices.
CREATE OR REPLACE FUNCTION public.guard_invoices_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_paid       IS DISTINCT FROM OLD.amount_paid
     OR NEW.balance_due    IS DISTINCT FROM OLD.balance_due
     OR NEW.status         IS DISTINCT FROM OLD.status
     OR NEW.signed_by      IS DISTINCT FROM OLD.signed_by
     OR NEW.signed_at      IS DISTINCT FROM OLD.signed_at
     OR NEW.signature_url  IS DISTINCT FROM OLD.signature_url
     OR NEW.invoice_hash   IS DISTINCT FROM OLD.invoice_hash
     OR NEW.total_amount   IS DISTINCT FROM OLD.total_amount
     OR NEW.subtotal       IS DISTINCT FROM OLD.subtotal
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
  THEN
    RAISE EXCEPTION 'Only admin/finance can change financial or signature fields on invoices'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;