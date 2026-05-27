
-- Skip SMS for website orders in 'pending' status.
-- Only send SMS once the order moves to 'processing'.
-- Email triggers are unaffected.

CREATE OR REPLACE FUNCTION public.trg_woo_orders_sms_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _event TEXT;
  _new_track TEXT := lower(COALESCE(NEW.tracking_status, ''));
  _old_track TEXT := lower(COALESCE(OLD.tracking_status, ''));
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Do NOT send SMS for pending website orders. Only fire SMS on insert
    -- when the order already lands in 'processing' (paid).
    IF lower(COALESCE(NEW.order_status, '')) <> 'processing' THEN
      RETURN NEW;
    END IF;
    _event := 'payment_received';
  ELSE
    IF NEW.order_status IS DISTINCT FROM OLD.order_status
       AND lower(COALESCE(NEW.order_status,'')) = 'processing' THEN
      _event := 'payment_received';
    ELSIF _new_track <> _old_track AND _new_track IN ('shipped','delivered') THEN
      _event := _new_track;
    ELSIF NEW.order_status IS DISTINCT FROM OLD.order_status
          AND lower(COALESCE(NEW.order_status,'')) = 'cancelled' THEN
      _event := 'cancelled';
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
$function$;

-- Internal orders: mirrored website orders use source='website' and status
-- 'po_received' for pending. Skip the 'created' SMS for those; only send
-- when status transitions to payment_received (handled by UPDATE branch).
CREATE OR REPLACE FUNCTION public.trg_orders_sms_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _event TEXT;
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- For website-sourced orders, only send SMS on insert if already paid.
    IF lower(COALESCE(NEW.source::text, '')) = 'website'
       AND NEW.status::text <> 'payment_received' THEN
      RETURN NEW;
    END IF;
    _event := CASE
                WHEN lower(COALESCE(NEW.source::text,'')) = 'website'
                     AND NEW.status::text = 'payment_received'
                  THEN 'payment_received'
                ELSE 'created'
              END;
  ELSE
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    _event := CASE NEW.status::text
                WHEN 'payment_received' THEN 'payment_received'
                WHEN 'in_transit'       THEN 'shipped'
                WHEN 'delivery_done'    THEN 'delivered'
                WHEN 'cancelled'        THEN 'cancelled'
                ELSE NULL
              END;
    IF _event IS NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.customer_phone IS NULL OR NEW.customer_phone = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', NEW.customer_name,
    'customer_email', NEW.customer_email,
    'order_id', NEW.id::text,
    'order_number', COALESCE(NEW.order_number, NEW.id::text),
    'amount', COALESCE(NEW.total_sales_amount, 0),
    'currency', 'INR',
    'tracking_number', NEW.tracking_number,
    'courier', NEW.courier_name,
    'status', NEW.status::text
  );

  PERFORM public.enqueue_order_notification_v2(
    'internal', NEW.id::text,
    COALESCE(NEW.order_number, NEW.id::text),
    _event, NEW.customer_phone, _payload, 'sms'
  );
  RETURN NEW;
END;
$function$;
