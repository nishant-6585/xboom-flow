
-- Ensure required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any prior version of the same job so re-running is idempotent
do $$
begin
  if exists (select 1 from cron.job where jobname = 'digilocker-initiate-warmup') then
    perform cron.unschedule('digilocker-initiate-warmup');
  end if;
end $$;

-- Warm the digilocker-initiate function every 5 minutes during
-- business hours (03:30–15:30 UTC = 09:00–21:00 IST), Monday–Saturday.
-- Uses the shared CRON_SECRET via vault so we don't leak it into
-- migration history.
select cron.schedule(
  'digilocker-initiate-warmup',
  '*/5 3-15 * * 1-6',
  $$
  select net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/digilocker-initiate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1)
    ),
    body := jsonb_build_object('warmup', true)
  );
  $$
);
