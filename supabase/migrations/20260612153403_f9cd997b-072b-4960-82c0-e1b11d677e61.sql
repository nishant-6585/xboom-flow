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

  -- Only advance order lifecycle status if it's still in an early/payment phase.
  -- Don't downgrade orders already in procurement/shipping/delivery/cancelled.
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

  UPDATE public.orders
  SET amount_paid = v_total_approved,
      payment_status = v_new_pay_status,
      status = v_new_order_status::order_status,
      updated_at = now()
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Backfill existing orders based on currently approved payments
UPDATE public.orders o
SET status = CASE
  WHEN o.payment_status = 'full' THEN 'payment_received'::order_status
  WHEN o.payment_status = 'partial' THEN 'partial_payment_received'::order_status
  ELSE o.status
END,
updated_at = now()
WHERE o.status IN ('po_received','payment_received','partial_payment_received')
  AND (
    (o.payment_status = 'full' AND o.status <> 'payment_received')
    OR (o.payment_status = 'partial' AND o.status <> 'partial_payment_received')
  );