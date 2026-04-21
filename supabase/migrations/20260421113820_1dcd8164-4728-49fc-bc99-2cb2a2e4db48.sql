-- Track sales lead lifecycle status per call_log
CREATE TABLE public.call_lead_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id UUID NOT NULL UNIQUE REFERENCES public.call_logs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','lost')),
  contacted_at TIMESTAMPTZ,
  qualified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  notes TEXT,
  updated_by UUID,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_lead_status_call_log_id ON public.call_lead_status(call_log_id);
CREATE INDEX idx_call_lead_status_status ON public.call_lead_status(status);
CREATE INDEX idx_call_mapping_myop_lookup ON public.call_mapping(myoperator_call_log_id) WHERE match_type <> 'UNMATCHED';

ALTER TABLE public.call_lead_status ENABLE ROW LEVEL SECURITY;

-- Authenticated users with sales/admin roles can view & manage
CREATE POLICY "Sales and admins can view lead status"
ON public.call_lead_status FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'sales')
  OR public.has_role(auth.uid(), 'sales_manager')
);

CREATE POLICY "Sales and admins can insert lead status"
ON public.call_lead_status FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'sales')
  OR public.has_role(auth.uid(), 'sales_manager')
);

CREATE POLICY "Sales and admins can update lead status"
ON public.call_lead_status FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'sales')
  OR public.has_role(auth.uid(), 'sales_manager')
);

CREATE TRIGGER update_call_lead_status_updated_at
BEFORE UPDATE ON public.call_lead_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-stamp the right timestamp when status changes
CREATE OR REPLACE FUNCTION public.stamp_call_lead_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'contacted' AND NEW.contacted_at IS NULL THEN
      NEW.contacted_at := now();
    ELSIF NEW.status = 'qualified' AND NEW.qualified_at IS NULL THEN
      NEW.qualified_at := now();
    ELSIF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    ELSIF NEW.status = 'lost' AND NEW.lost_at IS NULL THEN
      NEW.lost_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_call_lead_status_transition_trigger
BEFORE INSERT OR UPDATE ON public.call_lead_status
FOR EACH ROW EXECUTE FUNCTION public.stamp_call_lead_status_transition();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_lead_status;
ALTER TABLE public.call_lead_status REPLICA IDENTITY FULL;