-- =====================================================================
-- 1) Generalize order_notifications queue
-- =====================================================================
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS order_source TEXT,
  ADD COLUMN IF NOT EXISTS order_ref TEXT;

-- Backfill existing rows (all current rows are WooCommerce)
UPDATE public.order_notifications
SET order_source = 'woocommerce',
    order_ref    = woo_order_id
WHERE order_source IS NULL OR order_ref IS NULL;

ALTER TABLE public.order_notifications
  ALTER COLUMN order_source SET NOT NULL,
  ALTER COLUMN order_ref    SET NOT NULL,
  ALTER COLUMN woo_order_id DROP NOT NULL;

ALTER TABLE public.order_notifications
  DROP CONSTRAINT IF EXISTS order_notifications_order_source_check;
ALTER TABLE public.order_notifications
  ADD CONSTRAINT order_notifications_order_source_check
  CHECK (order_source IN ('internal','woocommerce','shopify','portal','repair','buyback'));

-- Replace WooCommerce-only unique index with a generalized one
DROP INDEX IF EXISTS public.order_notifications_uniq_order_status_channel;
CREATE UNIQUE INDEX IF NOT EXISTS order_notifications_uniq_source_ref_status_channel
  ON public.order_notifications (order_source, order_ref, status_trigger, channel);

CREATE INDEX IF NOT EXISTS order_notifications_source_ref_idx
  ON public.order_notifications (order_source, order_ref);

-- =====================================================================
-- 2) notification_templates: allow msg91 provider
-- =====================================================================
ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_provider_check;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_provider_check
  CHECK (provider IN ('interakt','meta','msg91'));

INSERT INTO public.notification_templates (event_type, provider, template_id, variables, is_active, description) VALUES
  ('created',          'msg91', 'TEMPLATE_ID_CREATED_PLACEHOLDER',   '["customer_name","order_number","amount"]'::jsonb,                                  TRUE, 'Order created — replace template_id with real MSG91 flow_id'),
  ('payment_received', 'msg91', 'TEMPLATE_ID_PAYMENT_PLACEHOLDER',   '["customer_name","order_number","amount"]'::jsonb,                                  TRUE, 'Payment received — replace template_id with real MSG91 flow_id'),
  ('shipped',          'msg91', 'TEMPLATE_ID_SHIPPED_PLACEHOLDER',   '["customer_name","order_number","courier","tracking_number"]'::jsonb,               TRUE, 'Order shipped — replace template_id with real MSG91 flow_id'),
  ('delivered',        'msg91', 'TEMPLATE_ID_DELIVERED_PLACEHOLDER', '["customer_name","order_number"]'::jsonb,                                           TRUE, 'Delivered — replace template_id with real MSG91 flow_id')
ON CONFLICT (event_type, provider, language) DO NOTHING;

-- =====================================================================
-- 3) Add customer_phone to internal orders
-- =====================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- NOTE: enquiries has no phone column, so no backfill possible.

-- =====================================================================
-- 4) claim_pending_notifications — add optional channel filter
--    Old signature (TEXT, INT) is dropped; new signature with default
--    NULL channel keeps existing callers (WhatsApp worker) working when
--    they're updated to pass _channel.
-- =====================================================================
DROP FUNCTION IF EXISTS public.claim_pending_notifications(TEXT, INT);

CREATE OR REPLACE FUNCTION public.claim_pending_notifications(
  _worker_id TEXT,
  _limit INT DEFAULT 20,
  _channel TEXT DEFAULT NULL
)
RETURNS SETOF public.order_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_batch AS (
    SELECT id
    FROM public.order_notifications
    WHERE status = 'pending'
      AND next_attempt_at <= now()
      AND (_channel IS NULL OR channel = _channel)
    ORDER BY next_attempt_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.order_notifications n
  SET locked_at = now(),
      locked_by = _worker_id,
      last_attempt_at = now()
  FROM next_batch
  WHERE n.id = next_batch.id
  RETURNING n.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_notifications(TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(TEXT, INT, TEXT) TO service_role;

-- =====================================================================
-- 5) enqueue_order_notification_v2 — generalized helper
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enqueue_order_notification_v2(
  _order_source TEXT,
  _order_ref    TEXT,
  _order_number TEXT,
  _event_type   TEXT,
  _phone        TEXT,
  _payload      JSONB,
  _channel      TEXT DEFAULT 'whatsapp'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  IF _order_ref IS NULL OR _order_ref = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.order_notifications (
    order_source, order_ref, woo_order_id, order_number,
    status_trigger, channel, phone,
    template_name, payload, status
  )
  VALUES (
    _order_source,
    _order_ref,
    CASE WHEN _order_source = 'woocommerce' THEN _order_ref ELSE NULL END,
    _order_number,
    _event_type,
    _channel,
    _phone,
    'order_' || _event_type || '_v1',
    COALESCE(_payload, '{}'::jsonb),
    'pending'
  )
  ON CONFLICT (order_source, order_ref, status_trigger, channel) DO NOTHING
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_notification_v2(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_order_notification_v2(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- =====================================================================
-- 6) Trigger functions — one per surface
--    All trigger functions skip silently if phone is NULL (queue would
--    fail-fast anyway; we'd rather not flood the queue with no-phone rows
--    for surfaces that legitimately have no phone).
-- =====================================================================

-- 6a) public.orders ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_orders_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
  ELSE
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    _event := CASE NEW.status::text
                WHEN 'payment_received' THEN 'payment_received'
                WHEN 'in_transit'       THEN 'shipped'
                WHEN 'delivery_done'    THEN 'delivered'
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
$$;

DROP TRIGGER IF EXISTS trg_orders_sms_notify_create ON public.orders;
CREATE TRIGGER trg_orders_sms_notify_create
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sms_notify();

DROP TRIGGER IF EXISTS trg_orders_sms_notify_status ON public.orders;
CREATE TRIGGER trg_orders_sms_notify_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sms_notify();

-- 6b) public.woocommerce_orders -----------------------------------------
CREATE OR REPLACE FUNCTION public.trg_woo_orders_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _new_track TEXT := lower(COALESCE(NEW.tracking_status, ''));
  _old_track TEXT := lower(COALESCE(OLD.tracking_status, ''));
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
  ELSE
    -- status -> processing  (payment confirmed)
    IF NEW.order_status IS DISTINCT FROM OLD.order_status
       AND lower(COALESCE(NEW.order_status,'')) = 'processing' THEN
      _event := 'payment_received';
    -- tracking_status -> shipped / delivered
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

DROP TRIGGER IF EXISTS trg_woocommerce_orders_sms_notify_create ON public.woocommerce_orders;
CREATE TRIGGER trg_woocommerce_orders_sms_notify_create
  AFTER INSERT ON public.woocommerce_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_woo_orders_sms_notify();

DROP TRIGGER IF EXISTS trg_woocommerce_orders_sms_notify_status ON public.woocommerce_orders;
CREATE TRIGGER trg_woocommerce_orders_sms_notify_status
  AFTER UPDATE OF order_status, tracking_status ON public.woocommerce_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_woo_orders_sms_notify();

-- 6c) public.shopify_orders ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_shopify_orders_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _new_fin TEXT := lower(COALESCE(NEW.financial_status, ''));
  _old_fin TEXT := lower(COALESCE(OLD.financial_status, ''));
  _new_ful TEXT := lower(COALESCE(NEW.fulfillment_status, ''));
  _old_ful TEXT := lower(COALESCE(OLD.fulfillment_status, ''));
  _ref TEXT := NEW.id::text;
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
  ELSE
    IF _new_fin <> _old_fin AND _new_fin = 'paid' THEN
      _event := 'payment_received';
    ELSIF _new_ful <> _old_ful AND _new_ful = 'fulfilled' THEN
      _event := 'shipped';
    ELSIF _new_ful <> _old_ful AND _new_ful = 'delivered' THEN
      _event := 'delivered';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.customer_phone IS NULL OR NEW.customer_phone = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', NEW.customer_name,
    'customer_email', NEW.customer_email,
    'order_id', _ref,
    'order_number', COALESCE(NEW.order_number::text, _ref),
    'amount', COALESCE(NEW.total_price, 0),
    'status', _event
  );

  PERFORM public.enqueue_order_notification_v2(
    'shopify', _ref,
    COALESCE(NEW.order_number::text, _ref),
    _event, NEW.customer_phone, _payload, 'sms'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shopify_orders_sms_notify_create ON public.shopify_orders;
CREATE TRIGGER trg_shopify_orders_sms_notify_create
  AFTER INSERT ON public.shopify_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_shopify_orders_sms_notify();

DROP TRIGGER IF EXISTS trg_shopify_orders_sms_notify_status ON public.shopify_orders;
CREATE TRIGGER trg_shopify_orders_sms_notify_status
  AFTER UPDATE OF financial_status, fulfillment_status ON public.shopify_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_shopify_orders_sms_notify();

-- 6d) public.portal_orders ----------------------------------------------
-- Phone is sourced from portal_contacts (primary active buyer for the account).
CREATE OR REPLACE FUNCTION public.trg_portal_orders_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _phone TEXT;
  _name  TEXT;
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
  ELSE
    IF NEW.current_state = OLD.current_state THEN RETURN NEW; END IF;
    _event := CASE NEW.current_state
                WHEN 'confirmed'  THEN 'payment_received'
                WHEN 'dispatched' THEN 'shipped'
                WHEN 'delivered'  THEN 'delivered'
                ELSE NULL
              END;
    IF _event IS NULL THEN RETURN NEW; END IF;
  END IF;

  SELECT COALESCE(NULLIF(c.phone,''), NULLIF(c.whatsapp_number,'')), c.full_name
    INTO _phone, _name
  FROM public.portal_contacts c
  WHERE c.account_id = NEW.account_id
    AND c.is_active = TRUE
  ORDER BY (c.role = 'buyer') DESC, c.created_at ASC
  LIMIT 1;

  IF _phone IS NULL OR _phone = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', COALESCE(_name, ''),
    'order_id', NEW.id::text,
    'order_number', NEW.order_number,
    'amount', COALESCE(NEW.total, 0),
    'courier', NEW.courier_name,
    'tracking_number', NEW.awb_number,
    'status', _event
  );

  PERFORM public.enqueue_order_notification_v2(
    'portal', NEW.id::text, NEW.order_number,
    _event, _phone, _payload, 'sms'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_orders_sms_notify_create ON public.portal_orders;
CREATE TRIGGER trg_portal_orders_sms_notify_create
  AFTER INSERT ON public.portal_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_orders_sms_notify();

DROP TRIGGER IF EXISTS trg_portal_orders_sms_notify_status ON public.portal_orders;
CREATE TRIGGER trg_portal_orders_sms_notify_status
  AFTER UPDATE OF current_state ON public.portal_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_orders_sms_notify();

-- 6e) public.repairs ----------------------------------------------------
-- Repairs have no shipment/payment state machine — only "created" and
-- "completed" (mapped to the 'delivered' template) are meaningful.
CREATE OR REPLACE FUNCTION public.trg_repairs_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
  ELSE
    -- Fires only when date_completed transitions from NULL to set.
    IF OLD.date_completed IS NOT DISTINCT FROM NEW.date_completed THEN RETURN NEW; END IF;
    IF NEW.date_completed IS NULL THEN RETURN NEW; END IF;
    _event := 'delivered';
  END IF;

  IF NEW.contact_no IS NULL OR NEW.contact_no = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', NEW.customer_name,
    'order_id', NEW.id::text,
    'order_number', COALESCE(NEW.repair_number, NEW.id::text),
    'amount', COALESCE(NEW.total_quote_amount, 0),
    'status', _event
  );

  PERFORM public.enqueue_order_notification_v2(
    'repair', NEW.id::text,
    COALESCE(NEW.repair_number, NEW.id::text),
    _event, NEW.contact_no, _payload, 'sms'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repairs_sms_notify_create ON public.repairs;
CREATE TRIGGER trg_repairs_sms_notify_create
  AFTER INSERT ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.trg_repairs_sms_notify();

DROP TRIGGER IF EXISTS trg_repairs_sms_notify_status ON public.repairs;
CREATE TRIGGER trg_repairs_sms_notify_status
  AFTER UPDATE OF date_completed ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.trg_repairs_sms_notify();

-- 6f) public.buyback_drones ---------------------------------------------
-- "Created" event = drone bought back, notify seller (seller_contact).
-- "Delivered" event = drone resold (stock_status -> 'Sold Out'),
--   notify buyer (buyer_contact). There is no shipped/payment intermediate.
CREATE OR REPLACE FUNCTION public.trg_buyback_drones_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
  _phone TEXT;
  _name  TEXT;
  _amount NUMERIC;
  _payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event  := 'created';
    _phone  := NEW.seller_contact;
    _name   := NEW.seller_name;
    _amount := NEW.buyback_price;
  ELSE
    IF NEW.stock_status = OLD.stock_status THEN RETURN NEW; END IF;
    IF lower(COALESCE(NEW.stock_status,'')) <> 'sold out' THEN RETURN NEW; END IF;
    _event  := 'delivered';
    _phone  := NEW.buyer_contact;
    _name   := NEW.buyer_name;
    _amount := COALESCE(NEW.selling_price, 0);
  END IF;

  IF _phone IS NULL OR _phone = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', COALESCE(_name, ''),
    'order_id', NEW.id::text,
    'order_number', NEW.serial_number,
    'amount', COALESCE(_amount, 0),
    'status', _event
  );

  PERFORM public.enqueue_order_notification_v2(
    'buyback', NEW.id::text, NEW.serial_number,
    _event, _phone, _payload, 'sms'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyback_drones_sms_notify_create ON public.buyback_drones;
CREATE TRIGGER trg_buyback_drones_sms_notify_create
  AFTER INSERT ON public.buyback_drones
  FOR EACH ROW EXECUTE FUNCTION public.trg_buyback_drones_sms_notify();

DROP TRIGGER IF EXISTS trg_buyback_drones_sms_notify_status ON public.buyback_drones;
CREATE TRIGGER trg_buyback_drones_sms_notify_status
  AFTER UPDATE OF stock_status ON public.buyback_drones
  FOR EACH ROW EXECUTE FUNCTION public.trg_buyback_drones_sms_notify();

-- =====================================================================
-- 7) Cron job — drain SMS queue every 2 minutes
-- =====================================================================
DO $$
DECLARE
  v_secret TEXT;
  v_jobid  BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET not in vault; skipping send-order-sms-msg91-worker cron schedule';
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'send-order-sms-msg91-worker';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'send-order-sms-msg91-worker',
    '*/2 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-order-sms-msg91',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := jsonb_build_object('triggered_by', 'cron', 'time', now())
      ) AS request_id;
    $cmd$, v_secret)
  );
END $$;