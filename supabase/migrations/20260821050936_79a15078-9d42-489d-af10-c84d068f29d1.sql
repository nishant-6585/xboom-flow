CREATE OR REPLACE FUNCTION public.invoices_self_update_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_privileged := has_role(v_uid, 'admin'::app_role)
               OR has_role(v_uid, 'finance'::app_role)
               OR has_role(v_uid, 'sales_manager'::app_role);

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- Signature / integrity fields are never self-editable
  NEW.signed_by      := OLD.signed_by;
  NEW.signed_by_name := OLD.signed_by_name;
  NEW.signed_at      := OLD.signed_at;
  NEW.signature_url  := OLD.signature_url;
  NEW.invoice_hash   := OLD.invoice_hash;

  -- Payment / settlement fields require finance or admin review
  NEW.amount_paid  := OLD.amount_paid;
  NEW.balance_due  := OLD.balance_due;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text NOT IN ('draft', 'pending_signature', 'sent', 'cancelled') THEN
    NEW.status := OLD.status;
  END IF;

  IF OLD.signed_at IS NOT NULL THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;