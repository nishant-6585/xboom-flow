CREATE OR REPLACE FUNCTION public.sync_order_amount_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_approved NUMERIC;
  v_total_amount NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Calculate total approved payments for this order
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_approved
  FROM public.payment_records
  WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
    AND status = 'approved';

  -- Get order total
  SELECT COALESCE(total_sales_amount, 0)
  INTO v_total_amount
  FROM public.orders
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  -- Determine payment status
  IF v_total_approved <= 0 THEN
    v_new_status := 'pending';
  ELSIF v_total_approved >= v_total_amount AND v_total_amount > 0 THEN
    v_new_status := 'received';
  ELSE
    v_new_status := 'partial';
  END IF;

  -- Update order
  UPDATE public.orders
  SET amount_paid = v_total_approved,
      payment_status = v_new_status,
      updated_at = now()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_order_amount_paid_on_payment_change
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON public.payment_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_amount_paid()