CREATE TABLE public.woo_lead_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  woo_order_id text NOT NULL,
  activity_type text NOT NULL DEFAULT 'note',
  description text NOT NULL,
  metadata jsonb,
  performed_by uuid NOT NULL REFERENCES auth.users(id),
  performed_by_name text NOT NULL DEFAULT '',
  activity_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT woo_lead_activities_type_check CHECK (
    activity_type IN ('call','whatsapp','email','note','status_change','view','followup')
  )
);

CREATE INDEX idx_woo_lead_activities_order ON public.woo_lead_activities(woo_order_id);
CREATE INDEX idx_woo_lead_activities_date ON public.woo_lead_activities(activity_date DESC);

ALTER TABLE public.woo_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view woo lead activities"
ON public.woo_lead_activities FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can insert their woo lead activities"
ON public.woo_lead_activities FOR INSERT
TO authenticated WITH CHECK (auth.uid() = performed_by);

CREATE POLICY "Owners or admins can update woo lead activities"
ON public.woo_lead_activities FOR UPDATE
TO authenticated
USING (auth.uid() = performed_by OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = performed_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners or admins can delete woo lead activities"
ON public.woo_lead_activities FOR DELETE
TO authenticated
USING (auth.uid() = performed_by OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_woo_lead_activities_updated_at
BEFORE UPDATE ON public.woo_lead_activities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();