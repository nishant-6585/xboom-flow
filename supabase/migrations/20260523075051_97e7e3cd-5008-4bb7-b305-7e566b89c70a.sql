DO $$
DECLARE
  v_secret text;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag';
  v_headers jsonb;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET not found in vault';
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'sync-myoperator-logs-every-minute';

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon,
    'x-cron-secret', v_secret
  );

  PERFORM cron.schedule(
    'sync-myoperator-logs-every-minute',
    '* * * * *',
    format($f$
      SELECT net.http_post(
        url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/sync-myoperator-logs',
        headers := %L::jsonb,
        body := jsonb_build_object('time', now())
      );
    $f$, v_headers::text)
  );
END $$;