CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
  items_subtotal numeric;
  recomputed_total numeric;
  effective_discount numeric;
  effective_delivery numeric;
  total_change_ok boolean := false;
BEGIN
  -- Supply chain team (e.g. Sanu Sabu, Md Altaf Hussain) needs to edit
  -- order financial fields (total, discount, amount paid, payment status,
  -- refund fields) to keep procurement / fulfilment in sync. Treat
  -- supply_chain the same as admin/finance/sales_manager here.
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager')
                OR public.has_role(auth.uid(), 'supply_chain');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- If total_sales_amount is changing, allow the change ONLY when the new
  -- value matches the item-driven recomputed total (with 1 paisa tolerance).
  IF NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount THEN
    SELECT COALESCE(SUM(COALESCE(unit_price, 0) * COALESCE(quantity, 0)), 0)
      INTO items_subtotal
      FROM public.order_items
     WHERE order_id = NEW.id;

    effective_discount := COALESCE(NEW.discount_amount, OLD.discount_amount, 0);
    effective_delivery := COALESCE(NEW.delivery_charges, OLD.delivery_charges, 0);
    recomputed_total := GREATEST(0, items_subtotal - effective_discount + effective_delivery);

    IF abs(COALESCE(NEW.total_sales_amount, 0) - recomputed_total) <= 0.01 THEN
      total_change_ok := true;
    END IF;
  END IF;

  IF NEW.payment_status       IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid       IS DISTINCT FROM OLD.amount_paid
     OR NEW.selling_price     IS DISTINCT FROM OLD.selling_price
     OR NEW.order_outcome     IS DISTINCT FROM OLD.order_outcome
     OR NEW.discount_amount   IS DISTINCT FROM OLD.discount_amount
     OR NEW.refund_status     IS DISTINCT FROM OLD.refund_status
     OR NEW.refund_requested_at IS DISTINCT FROM OLD.refund_requested_at
     OR NEW.refund_reason     IS DISTINCT FROM OLD.refund_reason
     OR (NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount AND NOT total_change_ok)
     OR NEW.sales_person_id   IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Only admin/finance/sales_manager/supply_chain can change financial, refund, or attribution fields on orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_orders_financial_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged :=
       public.has_role(uid, 'admin'::app_role)
    OR public.has_role(uid, 'finance'::app_role)
    OR public.has_role(uid, 'sales_manager'::app_role)
    OR public.has_role(uid, 'supply_chain'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount
  OR NEW.selling_price      IS DISTINCT FROM OLD.selling_price
  OR NEW.discount_amount    IS DISTINCT FROM OLD.discount_amount
  OR NEW.amount_paid        IS DISTINCT FROM OLD.amount_paid
  OR NEW.payment_status     IS DISTINCT FROM OLD.payment_status
  OR NEW.payment_due_date   IS DISTINCT FROM OLD.payment_due_date
  OR NEW.sales_person_id    IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Sales reps cannot modify financial terms (total, selling price, discount, amount paid, payment status/due date) or reassign ownership on their own orders. Ask admin, finance, supply chain, or a sales manager.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;