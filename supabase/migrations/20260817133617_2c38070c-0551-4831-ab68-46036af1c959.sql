CREATE TABLE IF NOT EXISTS public.whatsapp_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'interakt',
  provider_message_id text,
  phone text,
  template_name text,
  status text,
  failure_reason text,
  callback_data text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.whatsapp_message_events TO service_role;
GRANT SELECT ON public.whatsapp_message_events TO authenticated;

ALTER TABLE public.whatsapp_message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_events_admin_read" ON public.whatsapp_message_events
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_wa_events_phone_created
  ON public.whatsapp_message_events (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_events_msgid
  ON public.whatsapp_message_events (provider_message_id);