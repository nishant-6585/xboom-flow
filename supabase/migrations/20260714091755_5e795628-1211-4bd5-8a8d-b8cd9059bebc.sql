CREATE OR REPLACE FUNCTION public.orders_sales_locked_columns_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  -- Payment-record submissions update orders.amount_paid/payment_status/status via
  -- public.sync_order_amount_paid(). That function marks the derived order UPDATE
  -- with this transaction-local flag; do not treat that internal sync as a direct
  -- sales edit of locked payment columns.
  IF current_setting('app.orders_payment_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Users with any of these roles are allowed to change the locked columns.
  is_privileged := public.has_role(uid, 'admin')
                OR public.has_role(uid, 'sales_manager')
                OR public.has_role(uid, 'finance')
                OR public.has_role(uid, 'supply_chain');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Only enforce for sales-role callers editing their own orders. Other role
  -- combinations are governed by their own RLS policies.
  IF NOT public.has_role(uid, 'sales') THEN
    RETURN NEW;
  END IF;

  IF NEW.procurement_rate           IS DISTINCT FROM OLD.procurement_rate
     OR NEW.procurement_currency    IS DISTINCT FROM OLD.procurement_currency
     OR NEW.procurement_date        IS DISTINCT FROM OLD.procurement_date
     OR NEW.supplier_id             IS DISTINCT FROM OLD.supplier_id
     OR NEW.supplier_name           IS DISTINCT FROM OLD.supplier_name
     OR NEW.supplier_contact        IS DISTINCT FROM OLD.supplier_contact
     OR NEW.supplier_payment_terms  IS DISTINCT FROM OLD.supplier_payment_terms
     OR NEW.supplier_payment_due_date IS DISTINCT FROM OLD.supplier_payment_due_date
     OR NEW.payment_status          IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid             IS DISTINCT FROM OLD.amount_paid
     OR NEW.sales_person_id         IS DISTINCT FROM OLD.sales_person_id
     OR NEW.created_by              IS DISTINCT FROM OLD.created_by
     OR NEW.is_rto                  IS DISTINCT FROM OLD.is_rto
     OR NEW.rto_marked_at           IS DISTINCT FROM OLD.rto_marked_at
     OR NEW.rto_marked_by           IS DISTINCT FROM OLD.rto_marked_by
  THEN
    RAISE EXCEPTION 'Sales role cannot modify procurement, payment, ownership, or RTO fields on orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;