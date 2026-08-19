ALTER TABLE public.followups DROP CONSTRAINT IF EXISTS followups_source_type_check;
ALTER TABLE public.followups ADD CONSTRAINT followups_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'prospect','pipeline','enquiry','lead','company',
    'form_lead','email','google_ads','interakt','myoperator',
    'manychat','indiamart','facebook','outbound','call'
  ]));