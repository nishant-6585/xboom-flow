SELECT cron.unschedule('sync-myoperator-logs-every-minute');
SELECT cron.schedule(
  'sync-myoperator-logs-every-5-min',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/sync-myoperator-logs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
        'x-cron-secret', public.get_cron_secret()
      ),
      body := jsonb_build_object('time', now())
    );
  $$
);