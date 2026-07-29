ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb;
COMMENT ON COLUMN public.notifications.metadata IS
  'Optional extra context attached by the producer (e.g. email_dlq_alert stores per-event payload for View details and Resend actions).';