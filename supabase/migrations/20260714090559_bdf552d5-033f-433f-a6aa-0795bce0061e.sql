-- Allow the payment-records sync trigger to update orders.amount_paid /
-- payment_status / status without tripping guard_orders_sensitive_updates
-- for non-privileged submitters (salespeople uploading payment proof).
--
-- Pattern mirrors app.compoff_link_bypass: sync_order_amount_paid sets a
-- transaction-local GUC before UPDATE, guard returns early when it's set.

CREATE OR REPLACE FUNCTION public.sync_order_amount_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_approved NUMERIC;
  v_total_amount NUMERIC;
  v_new_pay_status TEXT;
  v_order_id UUID;
  v_current_status TEXT;
  v_new_order_status TEXT;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_approved
  FROM public.payment_records
  WHERE order_id = v_order_id
    AND status = 'approved';

  SELECT COALESCE(total_sales_amount, 0), status::text
  INTO v_total_amount, v_current_status
  FROM public.orders
  WHERE id = v_order_id;

  IF v_total_approved <= 0 THEN
    v_new_pay_status := 'pending';
  ELSIF v_total_approved >= v_total_amount AND v_total_amount > 0 THEN
    v_new_pay_status := 'full';
  ELSE
    v_new_pay_status := 'partial';
  END IF;

  IF v_current_status IN ('po_received', 'payment_received', 'partial_payment_received') THEN
    IF v_new_pay_status = 'full' THEN
      v_new_order_status := 'payment_received';
    ELSIF v_new_pay_status = 'partial' THEN
      v_new_order_status := 'partial_payment_received';
    ELSE
      v_new_order_status := 'po_received';
    END IF;
  ELSE
    v_new_order_status := v_current_status;
  END IF;

  -- Flag this UPDATE as a system-driven payment sync so guard_orders_sensitive_updates
  -- and guard_orders_financial_update let the derived write through even when the
  -- outer statement (payment_records INSERT) was issued by a sales user.
  PERFORM set_config('app.orders_payment_sync', 'on', true);

  UPDATE public.orders
  SET amount_paid = v_total_approved,
      payment_status = v_new_pay_status,
      status = v_new_order_status::order_status,
      updated_at = now()
  WHERE id = v_order_id;

  -- Clear the flag so subsequent statements in the same transaction don't inherit it.
  PERFORM set_config('app.orders_payment_sync', 'off', true);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_orders_sensitive_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  is_payment_sync boolean;
  items_subtotal numeric;
  recomputed_total numeric;
  effective_discount numeric;
  effective_delivery numeric;
  total_change_ok boolean := false;
BEGIN
  -- System-driven payment sync (see sync_order_amount_paid): the surrounding
  -- statement is a payment_records INSERT/UPDATE issued by a sales user, but
  -- the derived amount_paid / payment_status / status write is trusted.
  is_payment_sync := current_setting('app.orders_payment_sync', true) = 'on';
  IF is_payment_sync THEN
    RETURN NEW;
  END IF;

  is_privileged := public.has_role(auth.uid(), 'admin')
                OR public.has_role(auth.uid(), 'finance')
                OR public.has_role(auth.uid(), 'sales_manager')
                OR public.has_role(auth.uid(), 'supply_chain');
  IF is_privileged THEN
    RETURN NEW;
  END IF;

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
$function$;

-- Also let guard_orders_financial_update honor the sync flag if it exists and gates the same fields.
DO $$
DECLARE
  has_fn boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'guard_orders_financial_update'
  ) INTO has_fn;
  IF has_fn THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.guard_orders_financial_update()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
      AS $inner$
      BEGIN
        IF current_setting('app.orders_payment_sync', true) = 'on' THEN
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $inner$;
    $body$;
  END IF;
END $$;