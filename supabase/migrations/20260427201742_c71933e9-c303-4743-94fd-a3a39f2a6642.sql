ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_source_type_check;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_source_type_check
  CHECK (source_type = ANY (ARRAY['enquiry'::text, 'interakt'::text, 'myoperator'::text, 'email'::text, 'form_lead'::text, 'google_ads'::text, 'lead'::text]));

ALTER TABLE public.attention_items DROP CONSTRAINT IF EXISTS attention_items_source_type_check;
ALTER TABLE public.attention_items ADD CONSTRAINT attention_items_source_type_check
  CHECK (source_type = ANY (ARRAY['enquiry'::text, 'interakt'::text, 'myoperator'::text, 'email'::text, 'form_lead'::text, 'google_ads'::text, 'lead'::text]));