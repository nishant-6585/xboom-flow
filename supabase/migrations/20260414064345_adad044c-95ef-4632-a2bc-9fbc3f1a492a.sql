ALTER TABLE public.outbound_call_logs
  ADD COLUMN lead_created_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN scheduled_followup_at TIMESTAMPTZ DEFAULT NULL;