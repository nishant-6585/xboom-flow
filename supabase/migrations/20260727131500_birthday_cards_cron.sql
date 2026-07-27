-- Daily birthday-card dispatch: invoke the send-birthday-cards edge function
-- every morning at 9:00 AM IST (03:30 UTC). The function emails the birthday
-- card (greeting + photo + song link) to every employee whose birthday is
-- today and skips anyone already emailed today.

CREATE OR REPLACE FUNCTION public.invoke_send_birthday_cards()
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
    RAISE NOTICE 'CRON_SECRET missing from vault; skipping send-birthday-cards invocation';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-birthday-cards',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := jsonb_build_object('triggered_by', 'cron', 'time', now())
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_send_birthday_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_send_birthday_cards() TO postgres;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'send-birthday-cards-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  -- 03:30 UTC = 9:00 AM IST — birthday emails land at the start of the workday.
  PERFORM cron.schedule(
    'send-birthday-cards-daily',
    '30 3 * * *',
    $cmd$ SELECT public.invoke_send_birthday_cards(); $cmd$
  );
END $$;
