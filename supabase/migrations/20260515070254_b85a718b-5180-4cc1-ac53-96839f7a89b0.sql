
-- Auto-populate SLA timestamps on ticket creation
CREATE OR REPLACE FUNCTION public.portal_tickets_set_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fr_hours INT;
  res_hours INT;
BEGIN
  IF NEW.sla_first_response_due_at IS NULL THEN
    fr_hours := CASE lower(coalesce(NEW.priority, 'normal'))
      WHEN 'critical' THEN 1
      WHEN 'high'     THEN 4
      WHEN 'normal'   THEN 8
      WHEN 'low'      THEN 24
      ELSE 8
    END;
    NEW.sla_first_response_due_at := NEW.created_at + make_interval(hours => fr_hours);
  END IF;
  IF NEW.sla_resolution_due_at IS NULL THEN
    res_hours := CASE lower(coalesce(NEW.priority, 'normal'))
      WHEN 'critical' THEN 8
      WHEN 'high'     THEN 24
      WHEN 'normal'   THEN 72
      WHEN 'low'      THEN 168
      ELSE 72
    END;
    NEW.sla_resolution_due_at := NEW.created_at + make_interval(hours => res_hours);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_tickets_set_sla ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_set_sla
BEFORE INSERT ON public.portal_tickets
FOR EACH ROW EXECUTE FUNCTION public.portal_tickets_set_sla();

-- Backfill existing rows that lack SLA timestamps
UPDATE public.portal_tickets
SET sla_first_response_due_at = created_at + CASE lower(coalesce(priority, 'normal'))
      WHEN 'critical' THEN interval '1 hour'
      WHEN 'high'     THEN interval '4 hours'
      WHEN 'low'      THEN interval '24 hours'
      ELSE interval '8 hours' END
WHERE sla_first_response_due_at IS NULL;

UPDATE public.portal_tickets
SET sla_resolution_due_at = created_at + CASE lower(coalesce(priority, 'normal'))
      WHEN 'critical' THEN interval '8 hours'
      WHEN 'high'     THEN interval '24 hours'
      WHEN 'low'      THEN interval '168 hours'
      ELSE interval '72 hours' END
WHERE sla_resolution_due_at IS NULL;

-- Track which breaches we've already alerted on (avoid duplicate alerts)
CREATE TABLE IF NOT EXISTS public.portal_sla_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.portal_tickets(id) ON DELETE CASCADE,
  breach_type text NOT NULL CHECK (breach_type IN ('first_response', 'resolution')),
  alerted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, breach_type)
);

ALTER TABLE public.portal_sla_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff can read SLA alerts"
ON public.portal_sla_alerts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'sales'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_portal_tickets_sla_open
ON public.portal_tickets (status, sla_first_response_due_at, sla_resolution_due_at)
WHERE status NOT IN ('resolved', 'closed');
