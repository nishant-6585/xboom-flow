-- Audit table for sync health check runs
CREATE TABLE IF NOT EXISTS public.sync_health_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  stale_count integer NOT NULL DEFAULT 0,
  healthy_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_sent boolean NOT NULL DEFAULT false,
  triggered_by text NOT NULL DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_sync_health_runs_ran_at
  ON public.sync_health_runs (ran_at DESC);

ALTER TABLE public.sync_health_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Finance can read sync health runs" ON public.sync_health_runs;
CREATE POLICY "Admin/Finance can read sync health runs"
ON public.sync_health_runs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'finance'::app_role)
);

-- Hourly cron job — calls sync-health-check edge function with CRON_SECRET
DO $$
DECLARE
  v_secret text;
  v_jobid bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET not in vault; skipping cron schedule';
    RETURN;
  END IF;

  -- Unschedule existing job if present
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'lead-sync-health-hourly';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'lead-sync-health-hourly',
    '15 * * * *',  -- every hour at :15
    format($cmd$
      SELECT net.http_post(
        url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/sync-health-check',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := jsonb_build_object('triggered_by', 'cron', 'time', now())
      ) AS request_id;
    $cmd$, v_secret)
  );
END $$;