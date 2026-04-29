ALTER TABLE public.followups DROP CONSTRAINT IF EXISTS followups_source_type_check;
ALTER TABLE public.followups ADD CONSTRAINT followups_source_type_check
  CHECK (source_type = ANY (ARRAY['prospect'::text, 'pipeline'::text, 'enquiry'::text, 'lead'::text, 'company'::text]));

CREATE INDEX IF NOT EXISTS idx_followups_company_source
  ON public.followups (source_id)
  WHERE source_type = 'company';