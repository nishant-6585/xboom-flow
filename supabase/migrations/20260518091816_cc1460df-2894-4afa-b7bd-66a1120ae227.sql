/*
 * MSG91 FLOW SETUP NOTE
 * When wiring real flow_ids into notification_templates, the MSG91 Flow's
 * variable names must match notification_templates.variables verbatim.
 * Example: a 'shipped' flow must define vars named customer_name, order_number,
 * courier, tracking_number — NOT VAR1/VAR2.
 */

-- =====================================================================
-- 1) Seed 'cancelled' MSG91 template
-- =====================================================================
INSERT INTO public.notification_templates (event_type, provider, template_id, variables, is_active, description) VALUES
  ('cancelled', 'msg91', 'TEMPLATE_ID_CANCELLED_PLACEHOLDER',
   '["customer_name","order_number"]'::jsonb,
   TRUE, 'Order cancelled — replace template_id with real MSG91 flow_id')
ON CONFLICT (event_type, provider, language) DO NOTHING;

-- =====================================================================
-- 2a) public.orders — add 'cancelled' mapping
-- =====================================================================
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
$$;

-- =====================================================================
-- 2b) public.woocommerce_orders — add 'cancelled' branch
-- =====================================================================
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
$$;

-- =====================================================================
-- 2c) public.shopify_orders — add 'cancelled' via financial_status
-- (shopify_orders has no cancelled_at column; detect financial_status
--  transition to 'voided' or 'refunded')
-- =====================================================================
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
    ELSIF _new_fin <> _old_fin AND _new_fin IN ('voided','refunded') THEN
      _event := 'cancelled';
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

-- Shopify status trigger column list unchanged (financial_status already watched).
DROP TRIGGER IF EXISTS trg_shopify_orders_sms_notify_status ON public.shopify_orders;
CREATE TRIGGER trg_shopify_orders_sms_notify_status
  AFTER UPDATE OF financial_status, fulfillment_status ON public.shopify_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_shopify_orders_sms_notify();

-- =====================================================================
-- 2d) public.portal_orders — current_state 'cancelled' exists
-- =====================================================================
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
                WHEN 'cancelled'  THEN 'cancelled'
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

-- =====================================================================
-- 3) Buyback — remove misleading "Sold Out" => delivered SMS
-- buyback_drones has no delivered_at/dispatch_date field.
-- Keep INSERT (seller 'created') only. Drop UPDATE trigger.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_buyback_drones_sms_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payload JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    /* No customer-facing delivery state on buyback_drones today.
       Re-enable when a delivered_at field is introduced. */
    RETURN NEW;
  END IF;

  IF NEW.seller_contact IS NULL OR NEW.seller_contact = '' THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'customer_name', COALESCE(NEW.seller_name, ''),
    'order_id', NEW.id::text,
    'order_number', NEW.serial_number,
    'amount', COALESCE(NEW.buyback_price, 0),
    'status', 'created'
  );

  PERFORM public.enqueue_order_notification_v2(
    'buyback', NEW.id::text, NEW.serial_number,
    'created', NEW.seller_contact, _payload, 'sms'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyback_drones_sms_notify_status ON public.buyback_drones;