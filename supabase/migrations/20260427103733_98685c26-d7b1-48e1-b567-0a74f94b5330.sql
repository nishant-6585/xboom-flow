-- Notification status enum
DO $$ BEGIN
  CREATE TYPE public.order_notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Queue table
CREATE TABLE IF NOT EXISTS public.order_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id TEXT NOT NULL,
  order_number TEXT,
  status_trigger TEXT NOT NULL,            -- the new_status that triggered the notification
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  phone TEXT,
  template_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.order_notification_status NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  provider_response JSONB,
  status_log_id UUID REFERENCES public.woocommerce_order_status_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one row per (order, status_trigger, channel)
CREATE UNIQUE INDEX IF NOT EXISTS order_notifications_uniq_order_status_channel
  ON public.order_notifications (woo_order_id, status_trigger, channel);

-- Drain queue efficiently
CREATE INDEX IF NOT EXISTS order_notifications_pending_idx
  ON public.order_notifications (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS order_notifications_order_idx
  ON public.order_notifications (woo_order_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_order_notifications_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_notifications_updated_at ON public.order_notifications;
CREATE TRIGGER trg_order_notifications_updated_at
  BEFORE UPDATE ON public.order_notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_order_notifications_updated_at();

-- Enable RLS
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

-- Read access for ops roles
DROP POLICY IF EXISTS "Ops can view order notifications" ON public.order_notifications;
CREATE POLICY "Ops can view order notifications"
  ON public.order_notifications FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'supply_chain')
  );

-- No INSERT/UPDATE/DELETE policies → only service role (used by edge functions) can write.