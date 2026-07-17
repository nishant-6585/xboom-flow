-- 1) Attendance: lock check_out_time / working_hours / status once record has been closed
CREATE OR REPLACE FUNCTION public.guard_attendance_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'hr');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.date         IS DISTINCT FROM OLD.date
     OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
     OR NEW.source       IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Only HR/Admin can modify this attendance field'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.reconciliation_status IS DISTINCT FROM OLD.reconciliation_status
     OR NEW.corrected_by       IS DISTINCT FROM OLD.corrected_by
     OR NEW.corrected_at       IS DISTINCT FROM OLD.corrected_at
     OR NEW.auto_checkout_applied IS DISTINCT FROM OLD.auto_checkout_applied
     OR NEW.is_provisional_checkout IS DISTINCT FROM OLD.is_provisional_checkout THEN
    RAISE EXCEPTION 'Only HR/Admin can modify reconciliation fields'
      USING ERRCODE = '42501';
  END IF;

  -- Once the record has been closed out (check_out recorded), employees
  -- cannot rewrite hours / status / check_out_time. They must go through
  -- attendance_correction_requests instead.
  IF OLD.check_out_time IS NOT NULL THEN
    IF NEW.check_out_time IS DISTINCT FROM OLD.check_out_time
       OR NEW.working_hours  IS DISTINCT FROM OLD.working_hours
       OR NEW.status         IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Attendance already closed for the day. Submit an attendance correction request instead.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Invoices: extend guard to cover pdf_url, invoice_number, paid_date, total_gst, discount_percent
CREATE OR REPLACE FUNCTION public.guard_invoices_sensitive_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
     OR NEW.total_gst      IS DISTINCT FROM OLD.total_gst
     OR NEW.paid_date      IS DISTINCT FROM OLD.paid_date
     OR NEW.pdf_url        IS DISTINCT FROM OLD.pdf_url
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
  THEN
    RAISE EXCEPTION 'Only admin/finance can change financial, signature, or issued-document fields on invoices'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;