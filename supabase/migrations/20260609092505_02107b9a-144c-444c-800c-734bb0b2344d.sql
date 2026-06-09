SELECT cron.unschedule('sync-interakt-every-5min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-interakt-every-5min');

SELECT cron.schedule(
  'sync-interakt-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/sync-interakt-contacts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);