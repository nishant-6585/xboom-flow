DO $$
DECLARE
  v_new text := '8e487f59b398b446a368c05ba36c8852c6bccc3753131a49647c24721bb00a9a';
  v_id uuid;
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag';
  v_headers jsonb;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_new, 'CRON_SECRET');
  ELSE
    PERFORM vault.update_secret(v_id, v_new);
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon,
    'x-cron-secret', v_new
  );

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'sync-myoperator-logs-every-minute';

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