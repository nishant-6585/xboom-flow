
-- MyOperator configuration table
CREATE TABLE public.myoperator_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_token TEXT NOT NULL DEFAULT '',
  secret_key TEXT NOT NULL DEFAULT '',
  x_api_key TEXT NOT NULL DEFAULT '',
  company_id TEXT NOT NULL DEFAULT '',
  is_connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Call logs table
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id TEXT UNIQUE,
  caller_number TEXT NOT NULL,
  agent_number TEXT,
  agent_name TEXT,
  call_status TEXT NOT NULL DEFAULT 'incoming',
  call_duration INTEGER DEFAULT 0,
  call_type TEXT DEFAULT 'incoming',
  recording_url TEXT,
  ivr_input TEXT,
  raw_payload JSONB,
  lead_created BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.myoperator_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can manage config
CREATE POLICY "Admins can manage myoperator config"
ON public.myoperator_config
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: Authenticated users can view call logs
CREATE POLICY "Authenticated users can view call logs"
ON public.call_logs
FOR SELECT
TO authenticated
USING (true);

-- RLS: Admins can manage call logs
CREATE POLICY "Admins can manage call logs"
ON public.call_logs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow edge function (anon) to insert call logs
CREATE POLICY "Anon can insert call logs via webhook"
ON public.call_logs
FOR INSERT
TO anon
WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_myoperator_config_updated_at
  BEFORE UPDATE ON public.myoperator_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_call_logs_updated_at
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
