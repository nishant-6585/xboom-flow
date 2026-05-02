
-- 1. Add external_id and source to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Backfill existing rows explicitly
UPDATE public.orders SET source = 'manual' WHERE source IS NULL;

-- Unique index on external_id (only when set) to allow many manual orders with NULL
CREATE UNIQUE INDEX IF NOT EXISTS orders_external_id_unique
  ON public.orders (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_source_idx ON public.orders (source);

-- 2. woo_sync_logs table
CREATE TABLE IF NOT EXISTS public.woo_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id TEXT,
  internal_order_id UUID,
  event_type TEXT NOT NULL, -- 'webhook_in', 'backfill', 'reverse_push', 'hmac_fail'
  direction TEXT NOT NULL DEFAULT 'in', -- 'in' | 'out'
  status TEXT NOT NULL, -- 'success' | 'failed' | 'skipped'
  error_message TEXT,
  woo_status TEXT,
  attempt INT NOT NULL DEFAULT 1,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS woo_sync_logs_woo_order_id_idx ON public.woo_sync_logs (woo_order_id);
CREATE INDEX IF NOT EXISTS woo_sync_logs_created_at_idx ON public.woo_sync_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS woo_sync_logs_status_idx ON public.woo_sync_logs (status);

ALTER TABLE public.woo_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "woo_sync_logs_admin_finance_select" ON public.woo_sync_logs;
CREATE POLICY "woo_sync_logs_admin_finance_select"
  ON public.woo_sync_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')
  );

-- Service role bypasses RLS implicitly; no INSERT policy needed for users

-- 3. Trigger to fire reverse sync when website orders change
CREATE OR REPLACE FUNCTION public.trigger_woo_reverse_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_payload JSONB;
BEGIN
  -- Only fire for website-sourced orders with an external_id
  IF NEW.source IS DISTINCT FROM 'website' OR NEW.external_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only when something sync-relevant changed
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.refund_status IS NOT DISTINCT FROM OLD.refund_status
     AND NEW.is_rto IS NOT DISTINCT FROM OLD.is_rto
     AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
     AND NEW.actual_delivery IS NOT DISTINCT FROM OLD.actual_delivery
  THEN
    RETURN NEW;
  END IF;

  -- Fetch CRON_SECRET from vault
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;

  IF v_secret IS NULL THEN
    INSERT INTO public.woo_sync_logs (woo_order_id, internal_order_id, event_type, direction, status, error_message)
    VALUES (NEW.external_id, NEW.id, 'reverse_push', 'out', 'failed', 'CRON_SECRET not configured');
    RETURN NEW;
  END IF;

  v_url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/woocommerce-push-update';

  v_payload := jsonb_build_object(
    'order_id', NEW.id,
    'external_id', NEW.external_id,
    'status', NEW.status,
    'refund_status', NEW.refund_status,
    'is_rto', NEW.is_rto,
    'cancelled_at', NEW.cancelled_at,
    'actual_delivery', NEW.actual_delivery,
    'customer_notes', NEW.customer_notes
  );

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', v_secret
    ),
    body := v_payload,
    timeout_milliseconds := 8000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_woo_reverse_sync ON public.orders;
CREATE TRIGGER orders_woo_reverse_sync
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_woo_reverse_sync();

-- 4. Enable required extensions if not already
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
