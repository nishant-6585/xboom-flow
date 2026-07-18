
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- Update guard to subtract per-item discounts when recomputing total_sales_amount
CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  is_own boolean;
  items_subtotal numeric;
  recomputed_total numeric;
  effective_discount numeric;
  effective_delivery numeric;
  total_change_ok boolean := false;
BEGIN
  IF current_setting('app.orders_payment_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.price_refresh_bypass', true) = 'on' THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager')
                OR public.has_role(auth.uid(), 'supply_chain');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  is_own := (auth.uid() IS NOT NULL AND auth.uid() = OLD.sales_person_id);

  IF NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount THEN
    SELECT COALESCE(SUM(
             GREATEST(0, COALESCE(unit_price, 0) * COALESCE(quantity, 0) - COALESCE(discount_amount, 0))
           ), 0)
      INTO items_subtotal
      FROM public.order_items
     WHERE order_id = NEW.id;

    effective_discount := COALESCE(NEW.discount_amount, OLD.discount_amount, 0);
    effective_delivery := COALESCE(NEW.delivery_charges, OLD.delivery_charges, 0);
    recomputed_total := GREATEST(0, items_subtotal - effective_discount + effective_delivery);

    IF abs(COALESCE(NEW.total_sales_amount, 0) - recomputed_total) <= 0.01 THEN
      total_change_ok := true;
    END IF;

    IF is_own
       AND NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
       AND abs(
             (COALESCE(OLD.total_sales_amount, 0) - COALESCE(NEW.total_sales_amount, 0))
             -
             (COALESCE(NEW.discount_amount, 0) - COALESCE(OLD.discount_amount, 0))
           ) <= 0.01
    THEN
      total_change_ok := true;
    END IF;
  END IF;

  IF NEW.payment_status         IS DISTINCT FROM OLD.payment_status
     OR NEW.amount_paid         IS DISTINCT FROM OLD.amount_paid
     OR NEW.selling_price       IS DISTINCT FROM OLD.selling_price
     OR NEW.refund_status       IS DISTINCT FROM OLD.refund_status
     OR NEW.refund_requested_at IS DISTINCT FROM OLD.refund_requested_at
     OR NEW.refund_reason       IS DISTINCT FROM OLD.refund_reason
     OR NEW.sales_person_id     IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Only admin/finance/sales_manager/supply_chain can change financial, refund, or attribution fields on orders'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.order_outcome IS DISTINCT FROM OLD.order_outcome
     OR (NEW.total_sales_amount IS DISTINCT FROM OLD.total_sales_amount AND NOT total_change_ok)
  THEN
    IF NOT is_own THEN
      RAISE EXCEPTION 'Only the order owner (or admin/sales_manager) can change discount / outcome / total on this order'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
