DO $$
DECLARE v_secret text; v_url text; v_req bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'PROJECT_URL' LIMIT 1;
  IF v_url IS NULL THEN v_url := 'https://mxsotxddcvmeluqonuuj.supabase.co'; END IF;
  SELECT net.http_post(
    url := v_url || '/functions/v1/funnel-daily-report',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', v_secret),
    body := jsonb_build_object('force', true)
  ) INTO v_req;
  RAISE NOTICE 'request %', v_req;
END $$;