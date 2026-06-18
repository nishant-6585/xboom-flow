
CREATE OR REPLACE FUNCTION public.invoke_woocommerce_orders_reconcile()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_secret     text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET missing from vault; skipping woocommerce-orders-reconcile invocation';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/woocommerce-orders-reconcile',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := jsonb_build_object('triggered_by', 'cron', 'days', 7, 'time', now())
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_woocommerce_orders_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_woocommerce_orders_reconcile() TO postgres;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'woocommerce-orders-reconcile';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  -- Every 30 minutes — recovers missed webhooks and pulls AST tracking that
  -- WooCommerce strips from webhook payloads.
  PERFORM cron.schedule(
    'woocommerce-orders-reconcile',
    '*/30 * * * *',
    $cmd$ SELECT public.invoke_woocommerce_orders_reconcile(); $cmd$
  );
END $$;
