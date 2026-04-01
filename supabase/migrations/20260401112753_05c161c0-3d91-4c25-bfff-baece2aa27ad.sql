
-- Add AI columns to tickets table
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ai_category TEXT;

-- Create ticket_ai_suggestions table
CREATE TABLE public.ticket_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  suggested_priority TEXT,
  priority_reason TEXT,
  suggested_assignee_id UUID,
  suggested_assignee_name TEXT,
  draft_reply TEXT,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  applied_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ticket_sla_alerts table
CREATE TABLE public.ticket_sla_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  alert_message TEXT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  acknowledged_by_name TEXT
);

-- Indexes
CREATE INDEX idx_ticket_ai_suggestions_ticket_id ON public.ticket_ai_suggestions(ticket_id);
CREATE INDEX idx_ticket_sla_alerts_ticket_id ON public.ticket_sla_alerts(ticket_id);
CREATE INDEX idx_ticket_sla_alerts_unacknowledged ON public.ticket_sla_alerts(ticket_id) WHERE acknowledged = false;

-- Enable RLS
ALTER TABLE public.ticket_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sla_alerts ENABLE ROW LEVEL SECURITY;

-- RLS for ticket_ai_suggestions: Admin/HR can read all, assignee can read their own ticket's suggestions
CREATE POLICY "Admin and HR can read all AI suggestions"
  ON public.ticket_ai_suggestions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  );

CREATE POLICY "Assignee can read own ticket AI suggestions"
  ON public.ticket_ai_suggestions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_ai_suggestions.ticket_id
      AND t.assigned_to = auth.uid()
    )
  );

-- Service role insert (edge functions use service role)
CREATE POLICY "Service role can insert AI suggestions"
  ON public.ticket_ai_suggestions FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update AI suggestions"
  ON public.ticket_ai_suggestions FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can update applied status
CREATE POLICY "Authenticated can apply suggestions"
  ON public.ticket_ai_suggestions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
    OR EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_ai_suggestions.ticket_id
      AND t.assigned_to = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
    OR EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_ai_suggestions.ticket_id
      AND t.assigned_to = auth.uid()
    )
  );

-- RLS for ticket_sla_alerts
CREATE POLICY "Admin and HR can read all SLA alerts"
  ON public.ticket_sla_alerts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  );

CREATE POLICY "Assignee can read own ticket SLA alerts"
  ON public.ticket_sla_alerts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_sla_alerts.ticket_id
      AND (t.assigned_to = auth.uid() OR t.raised_by = auth.uid())
    )
  );

CREATE POLICY "Service role can insert SLA alerts"
  ON public.ticket_sla_alerts FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Admin and HR can acknowledge SLA alerts"
  ON public.ticket_sla_alerts FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')
  );
