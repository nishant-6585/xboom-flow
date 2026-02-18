-- Add reference_id to scope break nudges per session (not per day)
ALTER TABLE public.attendance_notifications_log
  ADD COLUMN IF NOT EXISTS reference_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.attendance_notifications_log.reference_id IS 
  'For break_nudge: stores attendance_log.id so each break session is tracked independently. For late_nudge: NULL (once per day is correct).';

-- Add nudge_health_log for monitoring silent failures
CREATE TABLE IF NOT EXISTS public.nudge_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  late_nudges_sent INTEGER NOT NULL DEFAULT 0,
  break_nudges_sent INTEGER NOT NULL DEFAULT 0,
  employees_checked INTEGER NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  log_detail JSONB DEFAULT NULL
);

ALTER TABLE public.nudge_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR and admin can view nudge health logs"
  ON public.nudge_health_log FOR SELECT
  USING (public.is_hr_or_admin(auth.uid()));

-- Keep only last 7 days of health logs (auto-cleanup via trigger)
CREATE OR REPLACE FUNCTION public.cleanup_old_nudge_health_logs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.nudge_health_log WHERE ran_at < now() - interval '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_nudge_health_after_insert
  AFTER INSERT ON public.nudge_health_log
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_old_nudge_health_logs();
