
-- Drop existing broken cron jobs (by schedule/url) and re-create using vault secret
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%/auto-checkout%'
       OR command ILIKE '%/attendance-nudge%'
       OR command ILIKE '%/check-sla-risk%'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- Re-create auto-checkout: every 30 minutes
SELECT cron.schedule(
  'auto-checkout-every-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/auto-checkout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Re-create attendance-nudge: every 5 minutes
SELECT cron.schedule(
  'attendance-nudge-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/attendance-nudge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

-- Re-create check-sla-risk: every 15 minutes
SELECT cron.schedule(
  'check-sla-risk-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/check-sla-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
