
-- =====================================================================
-- Catch-up SMS when a salesperson adds a missing customer_phone later
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_orders_phone_added_catchup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _old_digits TEXT := regexp_replace(COALESCE(OLD.customer_phone, ''), '\D', '', 'g');
  _new_digits TEXT := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  _status_event TEXT;
  _payload JSONB;
  _already_sent BOOLEAN;
BEGIN
  -- Only act when phone transitions from empty/invalid to a valid 10-15 digit number
  IF length(_old_digits) >= 10 THEN
    RETURN NEW;
  END IF;
  IF length(_new_digits) < 10 OR length(_new_digits) > 15 THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if we've already done a catch-up for this order
  SELECT EXISTS (
    SELECT 1 FROM public.domain_events
    WHERE event_type = 'order.phone_catchup_sent'
      AND entity_type = 'order'
      AND entity_id  = NEW.id
  ) INTO _already_sent;
  IF _already_sent THEN
    RETURN NEW;
  END IF;

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

  -- 1) Always send the "created" SMS (the customer never got one)
  PERFORM public.enqueue_order_notification_v2(
    'internal', NEW.id::text,
    COALESCE(NEW.order_number, NEW.id::text),
    'created', NEW.customer_phone, _payload, 'sms'
  );

  -- 2) Then send the current-status SMS if applicable
  _status_event := CASE NEW.status::text
                     WHEN 'payment_received' THEN 'payment_received'
                     WHEN 'in_transit'       THEN 'shipped'
                     WHEN 'delivery_done'    THEN 'delivered'
                     WHEN 'cancelled'        THEN 'cancelled'
                     ELSE NULL
                   END;

  IF _status_event IS NOT NULL THEN
    PERFORM public.enqueue_order_notification_v2(
      'internal', NEW.id::text,
      COALESCE(NEW.order_number, NEW.id::text),
      _status_event, NEW.customer_phone, _payload, 'sms'
    );
  END IF;

  -- Record so we never double-send if phone is later cleared and re-added
  INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload, processed, processed_at)
  VALUES (
    'order.phone_catchup_sent', 'order', NEW.id,
    jsonb_build_object(
      'status_at_catchup', NEW.status::text,
      'phone_digits', _new_digits,
      'sent_events', CASE WHEN _status_event IS NULL THEN ARRAY['created'] ELSE ARRAY['created', _status_event] END
    ),
    TRUE, now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_phone_added_catchup ON public.orders;
CREATE TRIGGER trg_orders_phone_added_catchup
  AFTER UPDATE OF customer_phone ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_phone_added_catchup();

-- =====================================================================
-- View: orders that still need a customer mobile number
-- =====================================================================
DROP VIEW IF EXISTS public.orders_missing_phone;
CREATE VIEW public.orders_missing_phone
  WITH (security_invoker = true)
AS
SELECT
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_company,
  o.customer_email,
  o.status,
  o.order_date,
  o.created_at,
  o.sales_person_id,
  o.sales_person_name,
  o.total_sales_amount
FROM public.orders o
WHERE
  COALESCE(o.status::text, '') NOT IN ('cancelled', 'delivery_done', 'rto')
  AND COALESCE(o.source, 'manual') <> 'website'
  AND length(regexp_replace(COALESCE(o.customer_phone, ''), '\D', '', 'g')) < 10;

GRANT SELECT ON public.orders_missing_phone TO authenticated;
