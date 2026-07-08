
-- Lock financial / procurement / ownership fields against sales-only updates
-- on orders and order_items. Sales reps retain their existing self-update
-- ability for the rest of the row via existing RLS policies; a trigger runs
-- with the caller's identity and blocks the specific columns unless the
-- caller also has admin / sales_manager / finance / supply_chain.

CREATE OR REPLACE FUNCTION public.orders_sales_locked_columns_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
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
$$;

DROP TRIGGER IF EXISTS trg_orders_sales_locked_columns ON public.orders;
CREATE TRIGGER trg_orders_sales_locked_columns
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_sales_locked_columns_check();


CREATE OR REPLACE FUNCTION public.order_items_sales_locked_columns_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(uid, 'admin')
                OR public.has_role(uid, 'sales_manager')
                OR public.has_role(uid, 'finance')
                OR public.has_role(uid, 'supply_chain');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(uid, 'sales') THEN
    RETURN NEW;
  END IF;

  IF NEW.procurement_rate                IS DISTINCT FROM OLD.procurement_rate
     OR NEW.procurement_gst_percent      IS DISTINCT FROM OLD.procurement_gst_percent
     OR NEW.procurement_gst_amount       IS DISTINCT FROM OLD.procurement_gst_amount
     OR NEW.procurement_price_includes_gst IS DISTINCT FROM OLD.procurement_price_includes_gst
     OR NEW.procurement_date             IS DISTINCT FROM OLD.procurement_date
     OR NEW.supplier_id                  IS DISTINCT FROM OLD.supplier_id
     OR NEW.estimated_procurement_rate   IS DISTINCT FROM OLD.estimated_procurement_rate
     OR NEW.quantity_procured            IS DISTINCT FROM OLD.quantity_procured
     OR NEW.fulfilled_from_stock         IS DISTINCT FROM OLD.fulfilled_from_stock
  THEN
    RAISE EXCEPTION 'Sales role cannot modify procurement or supplier fields on order items'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_sales_locked_columns ON public.order_items;
CREATE TRIGGER trg_order_items_sales_locked_columns
BEFORE UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.order_items_sales_locked_columns_check();
