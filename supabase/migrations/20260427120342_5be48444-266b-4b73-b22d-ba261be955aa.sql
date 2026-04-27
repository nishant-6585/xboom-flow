CREATE TABLE IF NOT EXISTS public.order_notifications_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id UUID,
  woo_order_id TEXT NOT NULL,
  order_number TEXT,
  status_trigger TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  phone TEXT,
  template_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  provider TEXT,
  provider_response JSONB,
  provider_message_id TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retried_from_dlq_at TIMESTAMPTZ,
  retried_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_notifications_dlq_order_idx
  ON public.order_notifications_dlq (woo_order_id);
CREATE INDEX IF NOT EXISTS order_notifications_dlq_moved_at_idx
  ON public.order_notifications_dlq (moved_at DESC);

ALTER TABLE public.order_notifications_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ops can view DLQ" ON public.order_notifications_dlq;
CREATE POLICY "Ops can view DLQ"
  ON public.order_notifications_dlq FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
    OR public.has_role(auth.uid(), 'supply_chain')
  );

ALTER TABLE public.order_notifications
  ADD COLUMN IF NOT EXISTS priority      INT  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS latency_ms    INT,
  ADD COLUMN IF NOT EXISTS provider_status_code INT,
  ADD COLUMN IF NOT EXISTS dlq_moved     BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.order_notifications
   SET priority = CASE status_trigger
     WHEN 'delivered'        THEN 100
     WHEN 'out_for_delivery' THEN 90
     WHEN 'cancelled'        THEN 80
     WHEN 'shipped'          THEN 70
     WHEN 'completed'        THEN 60
     WHEN 'processing'       THEN 40
     ELSE 5
   END
 WHERE priority = 5;

CREATE INDEX IF NOT EXISTS order_notifications_priority_pending_idx
  ON public.order_notifications (priority DESC, next_attempt_at ASC)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.enqueue_order_notification(
  _woo_order_id TEXT, _order_number TEXT, _event_type TEXT,
  _phone TEXT, _payload JSONB, _channel TEXT DEFAULT 'whatsapp'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID;
  _priority INT := CASE _event_type
    WHEN 'delivered'        THEN 100
    WHEN 'out_for_delivery' THEN 90
    WHEN 'cancelled'        THEN 80
    WHEN 'shipped'          THEN 70
    WHEN 'completed'        THEN 60
    WHEN 'processing'       THEN 40
    ELSE 5 END;
BEGIN
  INSERT INTO public.order_notifications (
    woo_order_id, order_number, status_trigger, channel, phone,
    template_name, payload, status, priority
  )
  VALUES (
    _woo_order_id, _order_number, _event_type, _channel, _phone,
    'order_' || _event_type || '_v1', COALESCE(_payload, '{}'::jsonb), 'pending', _priority
  )
  ON CONFLICT (woo_order_id, status_trigger, channel) DO NOTHING
  RETURNING id INTO _id;
  RETURN _id;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_order_notification(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_order_notification(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.notification_rate_limits (
  provider TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INT NOT NULL DEFAULT 0,
  max_per_minute INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.notification_rate_limits (provider, max_per_minute)
VALUES ('interakt', 30), ('meta', 30) ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notification_circuit_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  is_open BOOLEAN NOT NULL DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  reopen_at TIMESTAMPTZ,
  last_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = TRUE)
);
INSERT INTO public.notification_circuit_state (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

ALTER TABLE public.notification_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ops can view rate limits" ON public.notification_rate_limits;
CREATE POLICY "Ops can view rate limits"
  ON public.notification_rate_limits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

ALTER TABLE public.notification_circuit_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ops can view circuit state" ON public.notification_circuit_state;
CREATE POLICY "Ops can view circuit state"
  ON public.notification_circuit_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

CREATE OR REPLACE FUNCTION public.claim_pending_notifications(
  _worker_id TEXT, _limit INT DEFAULT 20
) RETURNS SETOF public.order_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_open BOOLEAN; _reopen_at TIMESTAMPTZ;
  _interakt_remaining INT; _meta_remaining INT; _effective_limit INT;
BEGIN
  SELECT is_open, reopen_at INTO _is_open, _reopen_at
  FROM public.notification_circuit_state WHERE id = TRUE;

  IF _is_open THEN
    IF _reopen_at IS NOT NULL AND _reopen_at <= now() THEN
      UPDATE public.notification_circuit_state
         SET is_open = FALSE, opened_at = NULL, reopen_at = NULL,
             last_reason = 'auto-reset', updated_at = now()
       WHERE id = TRUE;
    ELSE RETURN; END IF;
  END IF;

  UPDATE public.notification_rate_limits
     SET count = 0, window_start = now(), updated_at = now()
   WHERE window_start < now() - INTERVAL '1 minute';

  SELECT GREATEST(max_per_minute - count, 0) INTO _interakt_remaining
    FROM public.notification_rate_limits WHERE provider = 'interakt';
  SELECT GREATEST(max_per_minute - count, 0) INTO _meta_remaining
    FROM public.notification_rate_limits WHERE provider = 'meta';

  _effective_limit := LEAST(_limit, COALESCE(_interakt_remaining, 0) + COALESCE(_meta_remaining, 0));
  IF _effective_limit <= 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH next_batch AS (
    SELECT n.id FROM public.order_notifications n
    WHERE n.status = 'pending'
      AND n.next_attempt_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.order_notifications p
        WHERE p.phone IS NOT NULL AND p.phone = n.phone
          AND p.status = 'sent'
          AND p.sent_at > now() - INTERVAL '60 seconds'
          AND p.id <> n.id
      )
    ORDER BY n.priority DESC, n.next_attempt_at ASC
    LIMIT _effective_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.order_notifications n
     SET locked_at = now(), locked_by = _worker_id, last_attempt_at = now()
    FROM next_batch
   WHERE n.id = next_batch.id
  RETURNING n.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_pending_notifications(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_notifications(TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.bump_notification_rate(_provider TEXT, _delta INT DEFAULT 1)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_rate_limits (provider, count, window_start, updated_at)
  VALUES (_provider, _delta, now(), now())
  ON CONFLICT (provider) DO UPDATE
    SET count = CASE WHEN public.notification_rate_limits.window_start < now() - INTERVAL '1 minute'
                     THEN _delta ELSE public.notification_rate_limits.count + _delta END,
        window_start = CASE WHEN public.notification_rate_limits.window_start < now() - INTERVAL '1 minute'
                            THEN now() ELSE public.notification_rate_limits.window_start END,
        updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.bump_notification_rate(TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.compute_notification_health()
RETURNS TABLE (failure_rate NUMERIC, attempts_5m INT, failed_5m INT, pending_backlog INT, is_degraded BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _attempts INT; _failed INT; _backlog INT; _rate NUMERIC := 0; _open BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO _attempts FROM public.order_notifications
   WHERE last_attempt_at > now() - INTERVAL '5 minutes';
  SELECT COUNT(*) INTO _failed FROM public.order_notifications
   WHERE last_attempt_at > now() - INTERVAL '5 minutes' AND error_message IS NOT NULL;
  SELECT COUNT(*) INTO _backlog FROM public.order_notifications WHERE status = 'pending';
  SELECT is_open INTO _open FROM public.notification_circuit_state WHERE id = TRUE;
  IF _attempts > 0 THEN _rate := ROUND((_failed::NUMERIC / _attempts) * 100, 2); END IF;
  RETURN QUERY SELECT _rate, _attempts, _failed, _backlog, COALESCE(_open, FALSE);
END; $$;
GRANT EXECUTE ON FUNCTION public.compute_notification_health() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trip_notification_breaker(_reason TEXT, _minutes INT DEFAULT 10)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notification_circuit_state
     SET is_open = TRUE, opened_at = now(),
         reopen_at = now() + make_interval(mins => _minutes),
         last_reason = _reason, updated_at = now()
   WHERE id = TRUE;
END; $$;
GRANT EXECUTE ON FUNCTION public.trip_notification_breaker(TEXT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.move_notification_to_dlq(_notification_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dlq_id UUID;
BEGIN
  INSERT INTO public.order_notifications_dlq (
    original_id, woo_order_id, order_number, status_trigger, channel,
    phone, template_name, payload, retry_count, error_message,
    provider, provider_response, provider_message_id
  )
  SELECT id, woo_order_id, order_number, status_trigger, channel,
         phone, template_name, payload, retry_count, error_message,
         provider, provider_response, provider_message_id
    FROM public.order_notifications WHERE id = _notification_id
  RETURNING id INTO _dlq_id;

  UPDATE public.order_notifications
     SET dlq_moved = TRUE, updated_at = now()
   WHERE id = _notification_id;
  RETURN _dlq_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.move_notification_to_dlq(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_notification_from_dlq(_dlq_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new_id UUID; _r public.order_notifications_dlq%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager')) THEN
    RAISE EXCEPTION 'Forbidden: only admin / sales_manager can retry from DLQ';
  END IF;
  SELECT * INTO _r FROM public.order_notifications_dlq WHERE id = _dlq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DLQ row not found: %', _dlq_id; END IF;

  INSERT INTO public.order_notifications (
    woo_order_id, order_number, status_trigger, channel, phone,
    template_name, payload, status, retry_count, next_attempt_at, priority
  )
  VALUES (
    _r.woo_order_id, _r.order_number, _r.status_trigger, _r.channel, _r.phone,
    _r.template_name, _r.payload, 'pending', 0, now(),
    CASE _r.status_trigger
      WHEN 'delivered'        THEN 100
      WHEN 'out_for_delivery' THEN 90
      WHEN 'cancelled'        THEN 80
      WHEN 'shipped'          THEN 70
      WHEN 'completed'        THEN 60
      WHEN 'processing'       THEN 40
      ELSE 5
    END
  )
  ON CONFLICT (woo_order_id, status_trigger, channel)
  DO UPDATE SET
    status = 'pending', retry_count = 0, next_attempt_at = now(),
    error_message = NULL, locked_at = NULL, locked_by = NULL,
    dlq_moved = FALSE, updated_at = now()
  RETURNING id INTO _new_id;

  UPDATE public.order_notifications_dlq
     SET retried_from_dlq_at = now(), retried_by = auth.uid()
   WHERE id = _dlq_id;
  RETURN _new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.retry_notification_from_dlq(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.notification_metrics_today AS
SELECT
  COUNT(*) FILTER (WHERE status = 'sent'   AND sent_at::date = current_date)         AS messages_sent_today,
  COUNT(*) FILTER (WHERE status = 'failed' AND last_attempt_at::date = current_date) AS failed_messages_today,
  COUNT(*) FILTER (WHERE status = 'pending')                                         AS pending_backlog,
  ROUND(AVG(latency_ms) FILTER (WHERE status = 'sent' AND sent_at::date = current_date), 0) AS avg_latency_ms,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE retry_count > 0 AND last_attempt_at::date = current_date)
         / NULLIF(COUNT(*) FILTER (WHERE last_attempt_at::date = current_date), 0),
    2
  ) AS retry_rate_pct
FROM public.order_notifications;

GRANT SELECT ON public.notification_metrics_today TO authenticated;