DO $$
DECLARE s text;
BEGIN
  SELECT decrypted_secret INTO s FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  PERFORM net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/funnel-daily-report',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', s),
    body := '{"test_template":"order_delivered_v1","test_phone":"8050727713","test_values":["Nishant","TEST-001"]}'::jsonb
  );
END $$;