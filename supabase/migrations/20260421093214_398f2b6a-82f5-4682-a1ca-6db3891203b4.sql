CREATE TABLE IF NOT EXISTS public.call_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  elevenlabs_call_log_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  myoperator_call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL,
  match_type TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (match_type IN ('TRANSCRIPT_MATCH','TIME_MATCH','UNMATCHED')),
  match_confidence INTEGER NOT NULL DEFAULT 0 CHECK (match_confidence BETWEEN 0 AND 100),
  extracted_phone_number TEXT,
  extracted_name TEXT,
  matched_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (elevenlabs_call_log_id)
);

CREATE INDEX IF NOT EXISTS idx_call_mapping_extracted_phone ON public.call_mapping(extracted_phone_number);
CREATE INDEX IF NOT EXISTS idx_call_mapping_eleven ON public.call_mapping(elevenlabs_call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_mapping_myop ON public.call_mapping(myoperator_call_log_id);
CREATE INDEX IF NOT EXISTS idx_call_mapping_match_type ON public.call_mapping(match_type);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller_lead_source ON public.call_logs(caller_number, lead_source);

ALTER TABLE public.call_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_mapping_select_authorised"
ON public.call_mapping
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_manager'::app_role)
  OR public.has_role(auth.uid(), 'sales'::app_role)
);

CREATE POLICY "call_mapping_insert_admin"
ON public.call_mapping
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "call_mapping_update_admin"
ON public.call_mapping
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "call_mapping_delete_admin"
ON public.call_mapping
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_call_mapping_updated_at
BEFORE UPDATE ON public.call_mapping
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();