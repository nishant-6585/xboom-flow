-- Create hourly Gmail sync cron job
SELECT cron.schedule(
  'gmail-lead-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/gmail-lead-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{"auto_process_ai": true}'::jsonb
  );
  $$
);

-- Create hourly AI processor cron job (runs 5 min after sync)
SELECT cron.schedule(
  'email-ai-process-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/ai-email-lead-processor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := '{"action": "process", "batch_size": 20}'::jsonb
  );
  $$
);