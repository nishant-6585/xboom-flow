
-- Settings (single row) 
CREATE TABLE public.prospect_followup_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  shadow_mode boolean NOT NULL DEFAULT true,
  max_attempts int NOT NULL DEFAULT 4,
  cc_emails text[] NOT NULL DEFAULT ARRAY['amit@xboom.in']::text[],
  send_window_start time NOT NULL DEFAULT '10:00',
  send_window_end time NOT NULL DEFAULT '18:00',
  weekdays_only boolean NOT NULL DEFAULT true,
  ai_model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prospect_followup_settings TO authenticated;
GRANT ALL ON public.prospect_followup_settings TO service_role;
ALTER TABLE public.prospect_followup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read staff" ON public.prospect_followup_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "settings write admin" ON public.prospect_followup_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));
INSERT INTO public.prospect_followup_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Per-prospect state (pause/resume/skip)
CREATE TABLE public.prospect_followup_state (
  prospect_id uuid PRIMARY KEY REFERENCES public.prospects(id) ON DELETE CASCADE,
  paused boolean NOT NULL DEFAULT false,
  next_scheduled_at timestamptz,
  attempts_sent int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  stopped boolean NOT NULL DEFAULT false,
  stop_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.prospect_followup_state TO authenticated;
GRANT ALL ON public.prospect_followup_state TO service_role;
ALTER TABLE public.prospect_followup_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "state read staff" ON public.prospect_followup_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager') OR public.has_role(auth.uid(), 'sales'));
CREATE POLICY "state write manager" ON public.prospect_followup_state FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

-- Sent/queued follow-ups (audit)
CREATE TABLE public.prospect_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  attempt_no int NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  recipient_email text NOT NULL,
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  ai_model text,
  ai_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_message_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','skipped','failed','shadow')),
  skip_reason text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prospect_id, attempt_no)
);
GRANT SELECT ON public.prospect_followups TO authenticated;
GRANT ALL ON public.prospect_followups TO service_role;
ALTER TABLE public.prospect_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followups read staff" ON public.prospect_followups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager') OR public.has_role(auth.uid(), 'sales'));
CREATE INDEX idx_prospect_followups_prospect ON public.prospect_followups(prospect_id, attempt_no);
CREATE INDEX idx_prospect_followups_status ON public.prospect_followups(status, created_at DESC);

-- Trigger to keep updated_at fresh
CREATE TRIGGER prospect_followup_settings_touch BEFORE UPDATE ON public.prospect_followup_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER prospect_followup_state_touch BEFORE UPDATE ON public.prospect_followup_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
