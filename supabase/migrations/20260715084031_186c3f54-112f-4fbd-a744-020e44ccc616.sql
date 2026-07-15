
-- Track AI review metadata on leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS ai_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_review_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_review_model text;

-- Trigger function: fire AI review for sick leave submissions
CREATE OR REPLACE FUNCTION public.trigger_ai_sick_leave_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cron_secret text;
BEGIN
  IF NEW.status <> 'submitted' THEN RETURN NEW; END IF;
  IF NEW.leave_type NOT IN ('sick','half_day_sick') THEN RETURN NEW; END IF;

  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cron_secret := NULL;
  END;

  PERFORM net.http_post(
    url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/ai-sick-leave-review',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(v_cron_secret, '')
    ),
    body := jsonb_build_object('leave_request_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_review_sick_leave_on_insert ON public.leave_requests;
CREATE TRIGGER trg_ai_review_sick_leave_on_insert
AFTER INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.trigger_ai_sick_leave_review();
