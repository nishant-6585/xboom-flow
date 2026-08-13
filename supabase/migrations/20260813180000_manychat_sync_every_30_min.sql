-- ManyChat contact refresh: hourly → every 30 minutes, batch 200 → 500
-- (500 is the manychat-sync function's cap per run).
SELECT cron.unschedule('manychat-sync-hourly');
SELECT cron.schedule(
  'manychat-sync-every-30-min',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/manychat-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
        'x-cron-secret', public.get_cron_secret()
      ),
      body := jsonb_build_object('limit', 500)
    );
  $$
);
