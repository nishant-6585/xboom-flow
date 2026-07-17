-- Web Push infrastructure: browser push subscriptions + fan-out trigger.
--
-- Every row inserted into public.notifications is forwarded (async, via
-- pg_net) to the `send-push` edge function, which resolves the recipients
-- (user_id target or target_role broadcast), looks up their saved browser
-- push subscriptions and delivers a Web Push message signed with the VAPID
-- keys. Recipients get an OS-level notification even when the app tab is
-- closed (as long as they granted browser notification permission).

-- 1. Table: one row per browser (endpoint) per user.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users manage ONLY their own subscriptions. The send-push edge function
-- reads with the service role, so no cross-user SELECT is needed here.
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid());

-- 2. Fan-out trigger: forward every new notification to the send-push
--    edge function. Async via pg_net; a failure must never block the
--    notification insert itself.
CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cron_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_cron_secret
    FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_cron_secret := NULL;
  END;

  BEGIN
    PERFORM net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', COALESCE(v_cron_secret, '')
      ),
      body := jsonb_build_object('notification_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- pg_net unavailable or queue error: in-app notifications still work.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;
CREATE TRIGGER trg_send_push_on_notification
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.trigger_send_push_notification();
