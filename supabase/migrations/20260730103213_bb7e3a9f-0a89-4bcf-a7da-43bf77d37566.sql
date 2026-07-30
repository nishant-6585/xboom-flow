CREATE OR REPLACE FUNCTION public.get_pricelist_sync_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_manual record;
  v_cron record;
  v_backfill record;
  v_webhook_last timestamptz;
  v_webhook_24h int;
  v_webhook_7d int;
  v_webhook_failed_24h int;
  v_webhook_fail record;
  v_recent jsonb;
  v_schedule text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT created_at, payload, status INTO v_backfill
  FROM public.woo_sync_logs
  WHERE event_type = 'product_backfill'
  ORDER BY created_at DESC LIMIT 1;

  SELECT created_at, payload, status INTO v_manual
  FROM public.woo_sync_logs
  WHERE event_type = 'product_backfill'
    AND COALESCE(payload->>'trigger_source', 'manual') <> 'cron'
  ORDER BY created_at DESC LIMIT 1;

  SELECT created_at, payload, status INTO v_cron
  FROM public.woo_sync_logs
  WHERE event_type = 'product_backfill'
    AND payload->>'trigger_source' = 'cron'
  ORDER BY created_at DESC LIMIT 1;

  SELECT max(created_at) INTO v_webhook_last
  FROM public.woo_sync_logs WHERE event_type = 'product_webhook_in';

  SELECT count(*) INTO v_webhook_24h
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in' AND created_at > now() - interval '24 hours';

  SELECT count(*) INTO v_webhook_7d
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in' AND created_at > now() - interval '7 days';

  SELECT count(*) INTO v_webhook_failed_24h
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in'
    AND created_at > now() - interval '24 hours'
    AND status IN ('error', 'failed');

  SELECT created_at, payload, status INTO v_webhook_fail
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in' AND status IN ('error', 'failed')
  ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_agg(x ORDER BY x->>'at' DESC) INTO v_recent
  FROM (
    SELECT jsonb_build_object(
      'at', created_at,
      'kind', CASE
        WHEN event_type = 'product_webhook_in' THEN 'webhook'
        WHEN COALESCE(payload->>'trigger_source', 'manual') = 'cron' THEN 'cron'
        ELSE 'manual' END,
      'status', COALESCE(status, 'unknown'),
      'name', payload->>'name',
      'action', payload->>'action',
      'added', COALESCE((payload->>'created')::int, 0),
      'updated', COALESCE((payload->>'updated')::int, 0) + COALESCE((payload->>'linked')::int, 0),
      'removed', COALESCE((payload->>'removed')::int, 0),
      'failed', COALESCE((payload->>'failed')::int, 0),
      'error', COALESCE(payload->>'error', payload->>'message')
    ) AS x
    FROM public.woo_sync_logs
    WHERE event_type IN ('product_backfill', 'product_webhook_in')
    ORDER BY created_at DESC
    LIMIT 30
  ) s;

  SELECT schedule INTO v_schedule
  FROM cron.job WHERE jobname = 'woocommerce-products-reconcile' AND active LIMIT 1;

  RETURN jsonb_build_object(
    'backfill', CASE WHEN v_backfill.created_at IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_backfill.created_at,
      'source', COALESCE(v_backfill.payload->>'trigger_source', 'manual'),
      'status', v_backfill.status,
      'added', COALESCE((v_backfill.payload->>'created')::int, 0),
      'updated', COALESCE((v_backfill.payload->>'updated')::int, 0) + COALESCE((v_backfill.payload->>'linked')::int, 0),
      'removed', COALESCE((v_backfill.payload->>'removed')::int, 0),
      'skipped', COALESCE((v_backfill.payload->>'skipped')::int, 0),
      'failed', COALESCE((v_backfill.payload->>'failed')::int, 0),
      'error', COALESCE(v_backfill.payload->>'error', v_backfill.payload->>'message')
    ) END,
    'manual', CASE WHEN v_manual.created_at IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_manual.created_at,
      'status', v_manual.status,
      'added', COALESCE((v_manual.payload->>'created')::int, 0),
      'updated', COALESCE((v_manual.payload->>'updated')::int, 0) + COALESCE((v_manual.payload->>'linked')::int, 0),
      'removed', COALESCE((v_manual.payload->>'removed')::int, 0),
      'skipped', COALESCE((v_manual.payload->>'skipped')::int, 0),
      'failed', COALESCE((v_manual.payload->>'failed')::int, 0),
      'error', COALESCE(v_manual.payload->>'error', v_manual.payload->>'message')
    ) END,
    'cron', CASE WHEN v_cron.created_at IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_cron.created_at,
      'status', v_cron.status,
      'added', COALESCE((v_cron.payload->>'created')::int, 0),
      'updated', COALESCE((v_cron.payload->>'updated')::int, 0) + COALESCE((v_cron.payload->>'linked')::int, 0),
      'removed', COALESCE((v_cron.payload->>'removed')::int, 0),
      'skipped', COALESCE((v_cron.payload->>'skipped')::int, 0),
      'failed', COALESCE((v_cron.payload->>'failed')::int, 0),
      'error', COALESCE(v_cron.payload->>'error', v_cron.payload->>'message')
    ) END,
    'webhook', jsonb_build_object(
      'last_at', v_webhook_last,
      'count_24h', v_webhook_24h,
      'count_7d', v_webhook_7d,
      'failed_24h', v_webhook_failed_24h,
      'last_failure_at', v_webhook_fail.created_at,
      'last_failure_error', COALESCE(v_webhook_fail.payload->>'error', v_webhook_fail.payload->>'message')
    ),
    'recent', COALESCE(v_recent, '[]'::jsonb),
    'cron_schedule', v_schedule
  );
END;
$function$;