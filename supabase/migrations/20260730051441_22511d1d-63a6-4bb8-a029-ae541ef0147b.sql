CREATE OR REPLACE FUNCTION public.get_pricelist_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backfill record;
  v_webhook_last timestamptz;
  v_webhook_24h int;
  v_webhook_7d int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT created_at, payload INTO v_backfill
  FROM public.woo_sync_logs
  WHERE event_type = 'product_backfill'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT max(created_at) INTO v_webhook_last
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in';

  SELECT count(*) INTO v_webhook_24h
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in' AND created_at > now() - interval '24 hours';

  SELECT count(*) INTO v_webhook_7d
  FROM public.woo_sync_logs
  WHERE event_type = 'product_webhook_in' AND created_at > now() - interval '7 days';

  RETURN jsonb_build_object(
    'backfill', CASE WHEN v_backfill.created_at IS NULL THEN NULL ELSE jsonb_build_object(
      'at', v_backfill.created_at,
      'source', COALESCE(v_backfill.payload->>'trigger_source', 'manual'),
      'added', COALESCE((v_backfill.payload->>'created')::int, 0),
      'updated', COALESCE((v_backfill.payload->>'updated')::int, 0) + COALESCE((v_backfill.payload->>'linked')::int, 0),
      'removed', COALESCE((v_backfill.payload->>'removed')::int, 0),
      'skipped', COALESCE((v_backfill.payload->>'skipped')::int, 0),
      'failed', COALESCE((v_backfill.payload->>'failed')::int, 0)
    ) END,
    'webhook', jsonb_build_object(
      'last_at', v_webhook_last,
      'count_24h', v_webhook_24h,
      'count_7d', v_webhook_7d
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pricelist_sync_status() FROM public;
GRANT EXECUTE ON FUNCTION public.get_pricelist_sync_status() TO authenticated;