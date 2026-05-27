CREATE OR REPLACE FUNCTION public.invoke_send_order_sms_msg91()
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
    RAISE NOTICE 'CRON_SECRET missing from vault; skipping SMS MSG91 worker invocation';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-order-sms-msg91',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := jsonb_build_object('triggered_by', 'cron', 'time', now())
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_order_sms_msg91() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_send_order_sms_msg91() TO postgres;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'send-order-sms-msg91-worker';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'send-order-sms-msg91-worker',
    '*/2 * * * *',
    $cmd$ SELECT public.invoke_send_order_sms_msg91(); $cmd$
  );
END $$;

UPDATE public.order_notifications
   SET locked_at = NULL,
       locked_by = NULL
 WHERE channel = 'sms'
   AND status  = 'pending'
   AND locked_at IS NOT NULL;