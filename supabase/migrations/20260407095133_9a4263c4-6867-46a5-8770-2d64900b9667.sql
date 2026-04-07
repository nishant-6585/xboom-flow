
-- CRM Contact Activities table for tracking all interactions
CREATE TABLE public.crm_contact_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Link to prospect (central contact record)
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  -- Activity details
  activity_type TEXT NOT NULL DEFAULT 'call', -- call, email, whatsapp, meeting
  subject TEXT NOT NULL,
  notes TEXT,
  outcome TEXT, -- connected, no_answer, voicemail, interested, not_interested, follow_up_needed
  -- Follow-up scheduling
  followup_date TIMESTAMPTZ,
  followup_completed BOOLEAN DEFAULT false,
  followup_completed_at TIMESTAMPTZ,
  -- Who did it
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  performed_by_name TEXT NOT NULL DEFAULT '',
  activity_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_contact_activities ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can CRUD
CREATE POLICY "Authenticated users can view activities" ON public.crm_contact_activities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert activities" ON public.crm_contact_activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);

CREATE POLICY "Authenticated users can update activities" ON public.crm_contact_activities
  FOR UPDATE TO authenticated USING (true);

-- Index for fast lookups
CREATE INDEX idx_crm_activities_prospect ON public.crm_contact_activities(prospect_id);
CREATE INDEX idx_crm_activities_date ON public.crm_contact_activities(activity_date DESC);
CREATE INDEX idx_crm_activities_followup ON public.crm_contact_activities(followup_date) WHERE followup_completed = false;
