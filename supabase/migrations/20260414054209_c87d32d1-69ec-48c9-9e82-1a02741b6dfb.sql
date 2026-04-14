-- Create outbound call logs table
CREATE TABLE public.outbound_call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_source TEXT NOT NULL CHECK (lead_source IN ('myoperator', 'interakt')),
  lead_id TEXT NOT NULL,
  lead_name TEXT,
  lead_phone TEXT NOT NULL,
  lead_company TEXT,
  called_by UUID NOT NULL,
  called_by_name TEXT NOT NULL,
  call_notes TEXT,
  call_outcome TEXT NOT NULL DEFAULT 'connected' CHECK (call_outcome IN ('connected', 'not_answered', 'busy', 'callback', 'voicemail')),
  call_duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outbound_call_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view outbound call logs"
ON public.outbound_call_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create outbound call logs"
ON public.outbound_call_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = called_by);

CREATE POLICY "Users can update their own outbound call logs"
ON public.outbound_call_logs FOR UPDATE TO authenticated
USING (auth.uid() = called_by);

-- Index for performance
CREATE INDEX idx_outbound_call_logs_lead_source ON public.outbound_call_logs(lead_source);
CREATE INDEX idx_outbound_call_logs_called_by ON public.outbound_call_logs(called_by);
CREATE INDEX idx_outbound_call_logs_created_at ON public.outbound_call_logs(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_outbound_call_logs_updated_at
BEFORE UPDATE ON public.outbound_call_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();