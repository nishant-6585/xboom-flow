
-- Function: scan pending-confirmation orders and clear the requires_confirmation
-- flag on any order whose order_items contain no drone products (per the current
-- is_drone_product rule). Logs a domain_event per cleared order.
CREATE OR REPLACE FUNCTION public.clear_false_positive_confirmation_flags()
RETURNS TABLE(order_id uuid, order_number text, item_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  has_drone boolean;
  item_names jsonb;
  triggering_items jsonb;
  since timestamptz := now() - interval '90 days';
BEGIN
  FOR r IN
    SELECT o.id, o.order_number, o.external_id, o.customer_email, o.customer_name, o.source
    FROM public.orders o
    WHERE o.requires_confirmation = true
      AND coalesce(o.confirmation_status, 'pending') IN ('pending', 'not_sent')
      AND o.deleted_at IS NULL
      AND coalesce(o.status, '') <> 'cancelled'
      AND o.created_at >= since
  LOOP
    -- Aggregate item info and whether any item is a drone.
    SELECT
      bool_or(public.is_drone_product(oi.product_name, oi.product_category)),
      jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'product_category', oi.product_category,
        'quantity', oi.quantity
      ) ORDER BY oi.created_at)
    INTO has_drone, item_names
    FROM public.order_items oi
    WHERE oi.order_id = r.id;

    -- If there are no items yet, skip (webhook race — let the resend job handle later).
    IF item_names IS NULL THEN
      CONTINUE;
    END IF;

    -- If any item is a drone, leave the flag as-is.
    IF has_drone IS TRUE THEN
      CONTINUE;
    END IF;

    -- False positive: clear and log.
    triggering_items := item_names;

    UPDATE public.orders
    SET requires_confirmation = false,
        confirmation_status = 'not_required',
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.domain_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'order.confirmation_flag_cleared_false_positive',
      'order',
      r.id,
      jsonb_build_object(
        'order_number', r.order_number,
        'external_id', r.external_id,
        'customer_email', r.customer_email,
        'customer_name', r.customer_name,
        'source', r.source,
        'cleared_by', 'pre_resend_cron',
        'reason', 'No drone items detected under current is_drone_product rule',
        'triggering_items', triggering_items
      )
    );

    order_id := r.id;
    order_number := r.order_number;
    item_count := jsonb_array_length(triggering_items);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_false_positive_confirmation_flags() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_false_positive_confirmation_flags() TO service_role;

-- Schedule pre-cron: runs 5 minutes before the pending-portal-invites resend job.
-- resend runs daily at 10:00 UTC (per prior turn); pre-cron at 09:55 UTC.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clear-false-positive-confirmations-pre-resend') THEN
    PERFORM cron.unschedule('clear-false-positive-confirmations-pre-resend');
  END IF;

  PERFORM cron.schedule(
    'clear-false-positive-confirmations-pre-resend',
    '55 9 * * *',
    $cron$ SELECT public.clear_false_positive_confirmation_flags(); $cron$
  );
END $$;
