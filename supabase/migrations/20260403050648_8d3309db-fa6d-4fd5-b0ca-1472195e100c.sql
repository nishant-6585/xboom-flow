
-- Table: call_ai_analysis - stores AI analysis of call recordings
CREATE TABLE public.call_ai_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  transcript TEXT,
  intent TEXT, -- hot, warm, cold
  budget TEXT,
  timeline TEXT,
  key_requirements TEXT[],
  objections TEXT[],
  sentiment TEXT, -- positive, neutral, negative
  summary TEXT,
  next_action TEXT,
  confidence_score NUMERIC,
  raw_ai_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: call_webhook_logs - raw webhook payloads from Exotel
CREATE TABLE public.call_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'exotel',
  call_sid TEXT,
  raw_payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: integration_errors - error logging for external integrations
CREATE TABLE public.integration_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration TEXT NOT NULL, -- exotel, shopify, slack, etc
  function_name TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add exotel_call_sid to call_logs
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS exotel_call_sid TEXT;

-- RLS on call_ai_analysis
ALTER TABLE public.call_ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all call analysis"
  ON public.call_ai_analysis FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sales can view own call analysis"
  ON public.call_ai_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.call_logs cl
      WHERE cl.id = call_ai_analysis.call_log_id
      AND cl.sales_person_id = auth.uid()
    )
  );

-- RLS on call_webhook_logs
ALTER TABLE public.call_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view webhook logs"
  ON public.call_webhook_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS on integration_errors
ALTER TABLE public.integration_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view integration errors"
  ON public.integration_errors FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage integration errors"
  ON public.integration_errors FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: Auto-update lead score when call analysis is created
CREATE OR REPLACE FUNCTION public.update_lead_score_on_call_analysis()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_lead_id UUID;
  v_score INTEGER;
  v_temperature TEXT;
BEGIN
  -- Get the lead_id from call_logs
  SELECT lead_id INTO v_lead_id
  FROM public.call_logs
  WHERE id = NEW.call_log_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate score based on intent + sentiment
  IF NEW.intent = 'hot' AND NEW.sentiment = 'positive' THEN
    v_score := 9; v_temperature := 'Hot';
  ELSIF NEW.intent = 'hot' THEN
    v_score := 8; v_temperature := 'Hot';
  ELSIF NEW.intent = 'warm' AND NEW.sentiment = 'positive' THEN
    v_score := 7; v_temperature := 'Warm';
  ELSIF NEW.intent = 'warm' THEN
    v_score := 6; v_temperature := 'Warm';
  ELSIF NEW.intent = 'cold' AND NEW.sentiment = 'negative' THEN
    v_score := 2; v_temperature := 'Cold';
  ELSE
    v_score := 4; v_temperature := 'Cold';
  END IF;

  UPDATE public.enquiries
  SET lead_score = v_score,
      lead_temperature = v_temperature,
      updated_at = now()
  WHERE id = v_lead_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_lead_score_on_call_analysis
  AFTER INSERT ON public.call_ai_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_score_on_call_analysis();
