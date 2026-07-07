-- Relax guard_orders_sensitive_updates: allow non-privileged roles (sales rep)
-- to change orders.total_sales_amount when the new value equals the recomputed
-- sum(order_items.unit_price * quantity) minus current discount plus current
-- delivery_charges. This lets a sales rep add or remove line items (which
-- legitimately changes the order total) without hitting the guard, while still
-- blocking hand-edits of total_sales_amount that don't match the items.
--
-- Ticket TKT2600153 follow-up: adding a line item was previously blocked by
-- the guard (feature-shaped bug). Discount / delivery_charges themselves stay
-- gated on this trigger only through discount_amount — reps still cannot
-- change discount_amount alone.
CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
  items_subtotal numeric;
  recomputed_total numeric;
  effective_discount numeric;
  effective_delivery numeric;
  total_change_ok boolean := false;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager');
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
    RAISE EXCEPTION 'Only admin/finance/sales_manager can change financial, refund, or attribution fields on orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;