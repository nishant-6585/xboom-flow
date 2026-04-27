-- =====================================================================
-- 1) notification_templates table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,                 -- e.g. processing, shipped, out_for_delivery, delivered, cancelled
  provider TEXT NOT NULL CHECK (provider IN ('interakt', 'meta')),
  template_id TEXT NOT NULL,                -- provider-side template name / id
  language TEXT NOT NULL DEFAULT 'en',
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ordered list of variable names
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_uniq
  ON public.notification_templates (event_type, provider, language);

CREATE INDEX IF NOT EXISTS notification_templates_active_idx
  ON public.notification_templates (event_type, provider) WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON public.notification_templates;
CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_order_notifications_updated_at();

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view templates" ON public.notification_templates;
CREATE POLICY "Admins can view templates"
  ON public.notification_templates FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

DROP POLICY IF EXISTS "Admins can manage templates" ON public.notification_templates;
CREATE POLICY "Admins can manage templates"
  ON public.notification_templates FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

-- =====================================================================
-- 2) order_notifications: add provider tracking columns
-- =====================================================================
ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS provider TEXT,                 -- which provider was used at send time
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,      -- id returned by provider after success
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,         -- atomic claim timestamp
  ADD COLUMN IF NOT EXISTS locked_by TEXT;                -- worker id holding the row

CREATE INDEX IF NOT EXISTS order_notifications_provider_msg_idx
  ON public.order_notifications (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- =====================================================================
-- 3) Shipment fields on woocommerce_orders (idempotent — many may exist)
-- =====================================================================
ALTER TABLE public.woocommerce_orders
  ADD COLUMN IF NOT EXISTS tracking_status TEXT,        -- shipped | out_for_delivery | delivered
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS courier TEXT,
  ADD COLUMN IF NOT EXISTS expected_delivery DATE;

-- =====================================================================
-- 4) Atomic claim function — prevents duplicate sends across workers
-- Uses FOR UPDATE SKIP LOCKED + status flip in one statement.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.claim_pending_notifications(
  _worker_id TEXT,
  _limit INT DEFAULT 20
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

REVOKE ALL ON FUNCTION public.claim_pending_notifications(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(TEXT, INT) TO service_role;

-- =====================================================================
-- 5) Idempotent enqueue helper (used by triggers + functions)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enqueue_order_notification(
  _woo_order_id TEXT,
  _order_number TEXT,
  _event_type TEXT,
  _phone TEXT,
  _payload JSONB,
  _channel TEXT DEFAULT 'whatsapp'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  INSERT INTO public.order_notifications (
    woo_order_id, order_number, status_trigger, channel, phone,
    template_name, payload, status
  )
  VALUES (
    _woo_order_id, _order_number, _event_type, _channel, _phone,
    'order_' || _event_type || '_v1', COALESCE(_payload, '{}'::jsonb), 'pending'
  )
  ON CONFLICT (woo_order_id, status_trigger, channel) DO NOTHING
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_notification(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_order_notification(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- =====================================================================
-- 6) Shipment trigger — fires when tracking_status changes
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_woo_order_shipment_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event TEXT;
  _new_status TEXT := lower(COALESCE(NEW.tracking_status, ''));
  _old_status TEXT := lower(COALESCE(OLD.tracking_status, ''));
BEGIN
  IF _new_status = _old_status OR _new_status = '' THEN
    RETURN NEW;
  END IF;

  -- Only the three customer-facing shipment events trigger notifications
  IF _new_status NOT IN ('shipped', 'out_for_delivery', 'delivered') THEN
    RETURN NEW;
  END IF;

  _event := _new_status;

  PERFORM public.enqueue_order_notification(
    NEW.woo_order_id,
    NEW.order_number,
    _event,
    NEW.customer_phone,
    jsonb_build_object(
      'customer_name', NEW.customer_name,
      'customer_email', NEW.customer_email,
      'order_id', NEW.woo_order_id,
      'order_number', NEW.order_number,
      'amount', COALESCE(NEW.total_sales_amount, 0),
      'currency', COALESCE(NEW.currency, 'INR'),
      'tracking_number', NEW.tracking_number,
      'courier', NEW.courier,
      'expected_delivery', NEW.expected_delivery,
      'status', _new_status
    ),
    'whatsapp'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_woo_order_shipment_notify ON public.woocommerce_orders;
CREATE TRIGGER trg_woo_order_shipment_notify
  AFTER UPDATE OF tracking_status ON public.woocommerce_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_woo_order_shipment_notify();

-- =====================================================================
-- 7) Seed default templates (Interakt active, Meta inactive placeholder)
-- =====================================================================
INSERT INTO public.notification_templates (event_type, provider, template_id, variables, is_active, description) VALUES
  ('processing',       'interakt', 'order_processing_v1',       '["customer_name","order_number","amount"]'::jsonb,                                  TRUE,  'Order moved to processing'),
  ('shipped',          'interakt', 'order_shipped_v1',          '["customer_name","order_number","courier","tracking_number"]'::jsonb,               TRUE,  'Order has been shipped'),
  ('out_for_delivery', 'interakt', 'order_out_for_delivery_v1', '["customer_name","order_number","expected_delivery"]'::jsonb,                       TRUE,  'Order is out for delivery'),
  ('delivered',        'interakt', 'order_delivered_v1',        '["customer_name","order_number"]'::jsonb,                                           TRUE,  'Order delivered'),
  ('completed',        'interakt', 'order_completed_v1',        '["customer_name","order_number","amount"]'::jsonb,                                  TRUE,  'Order completed'),
  ('cancelled',        'interakt', 'order_cancelled_v1',        '["customer_name","order_number"]'::jsonb,                                           TRUE,  'Order cancelled'),
  ('processing',       'meta',     'order_processing_v1',       '["customer_name","order_number","amount"]'::jsonb,                                  FALSE, 'Meta WABA placeholder'),
  ('shipped',          'meta',     'order_shipped_v1',          '["customer_name","order_number","courier","tracking_number"]'::jsonb,               FALSE, 'Meta WABA placeholder'),
  ('delivered',        'meta',     'order_delivered_v1',        '["customer_name","order_number"]'::jsonb,                                           FALSE, 'Meta WABA placeholder'),
  ('cancelled',        'meta',     'order_cancelled_v1',        '["customer_name","order_number"]'::jsonb,                                           FALSE, 'Meta WABA placeholder')
ON CONFLICT (event_type, provider, language) DO NOTHING;