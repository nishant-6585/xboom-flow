
-- 1) Cancel pending backfill SMS rows for woocommerce 'created' event.
UPDATE public.order_notifications
SET status = 'failed',
    error_message = COALESCE(error_message, '') || ' | cancelled: backfill of old website orders (business rule)',
    retry_count = 3,
    locked_at = NULL,
    locked_by = NULL,
    last_attempt_at = now()
WHERE channel = 'sms'
  AND order_source = 'woocommerce'
  AND status_trigger = 'created'
  AND status IN ('pending');

-- 2) Restrict the woocommerce SMS trigger so 'created' only fires for
--    genuinely new orders in 'processing' state (within last 24h).
CREATE OR REPLACE FUNCTION public.trg_woo_orders_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _new_track TEXT := lower(COALESCE(NEW.tracking_status, ''));
  _old_track TEXT := lower(COALESCE(OLD.tracking_status, ''));
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only send "created" SMS for newly-placed website orders that are
    -- already paid/processing. Skip backfills of older orders entirely.
    IF lower(COALESCE(NEW.order_status,'')) <> 'processing' THEN
      RETURN NEW;
    END IF;
    IF NEW.woo_created_at IS NULL
       OR NEW.woo_created_at < now() - interval '24 hours' THEN
      RETURN NEW;
    END IF;
    _event := 'created';
  ELSE
    -- status -> processing  (payment confirmed) — keep, but only for recent orders.
    IF NEW.order_status IS DISTINCT FROM OLD.order_status
       AND lower(COALESCE(NEW.order_status,'')) = 'processing' THEN
      IF NEW.woo_created_at IS NULL
         OR NEW.woo_created_at < now() - interval '24 hours' THEN
        RETURN NEW;
      END IF;
      _event := 'payment_received';
    -- tracking_status -> shipped / delivered (always allowed, regardless of age)
    ELSIF _new_track <> _old_track AND _new_track IN ('shipped','delivered') THEN
      _event := _new_track;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.customer_phone IS NULL OR NEW.customer_phone = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', NEW.customer_name,
    'customer_email', NEW.customer_email,
    'order_id', NEW.woo_order_id,
    'order_number', COALESCE(NEW.order_number, NEW.woo_order_id),
    'amount', COALESCE(NEW.total_sales_amount, 0),
    'currency', COALESCE(NEW.currency, 'INR'),
    'tracking_number', NEW.tracking_number,
    'courier', NEW.courier,
    'status', _event
  );

  PERFORM public.enqueue_order_notification_v2(
    'woocommerce', NEW.woo_order_id,
    COALESCE(NEW.order_number, NEW.woo_order_id),
    _event, NEW.customer_phone, _payload, 'sms'
  );
  RETURN NEW;
END;
$$;
