
-- Followups table for tracking scheduled follow-ups
CREATE TABLE public.followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('prospect', 'pipeline', 'enquiry', 'lead')),
  source_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_company TEXT,
  product_name TEXT,
  phone TEXT,
  email TEXT,
  is_a_category BOOLEAN DEFAULT false,
  followup_at TIMESTAMPTZ NOT NULL,
  reminder_sent BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')),
  remark TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  completed_by_name TEXT,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_followups_user_id ON public.followups (user_id);
CREATE INDEX idx_followups_followup_at ON public.followups (followup_at);
CREATE INDEX idx_followups_status ON public.followups (status);
CREATE INDEX idx_followups_source ON public.followups (source_type, source_id);

-- RLS
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view followups
CREATE POLICY "Users can view followups" ON public.followups
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

-- Users can create followups
CREATE POLICY "Users can create followups" ON public.followups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Users can update their own followups, admins can update all
CREATE POLICY "Users can update followups" ON public.followups
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

-- Users can delete their own followups
CREATE POLICY "Users can delete followups" ON public.followups
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Updated at trigger
CREATE TRIGGER set_followups_updated_at
  BEFORE UPDATE ON public.followups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
