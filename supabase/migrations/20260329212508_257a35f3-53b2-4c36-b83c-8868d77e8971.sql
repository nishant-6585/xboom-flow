
-- Missed call callbacks table
CREATE TABLE public.missed_call_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  caller_number TEXT NOT NULL,
  customer_name TEXT,
  customer_company TEXT,
  product_name TEXT,
  city TEXT,
  assigned_to UUID,
  assigned_to_name TEXT,
  assigned_by UUID,
  assigned_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'reassigned')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  remark TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  completed_by_name TEXT,
  call_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_callbacks_assigned ON public.missed_call_callbacks (assigned_to);
CREATE INDEX idx_callbacks_status ON public.missed_call_callbacks (status);
CREATE INDEX idx_callbacks_call_time ON public.missed_call_callbacks (call_time);

ALTER TABLE public.missed_call_callbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view callbacks" ON public.missed_call_callbacks
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

CREATE POLICY "Users can create callbacks" ON public.missed_call_callbacks
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update callbacks" ON public.missed_call_callbacks
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

CREATE TRIGGER set_callbacks_updated_at
  BEFORE UPDATE ON public.missed_call_callbacks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
