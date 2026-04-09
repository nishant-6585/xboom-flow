
-- Outbound contacts table
CREATE TABLE public.outbound_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region TEXT,
  city TEXT,
  company_name TEXT,
  contact_name TEXT NOT NULL,
  designation TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  address TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  source TEXT,
  uploaded_by TEXT,
  uploaded_by_id UUID,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Case-insensitive unique email constraint
CREATE UNIQUE INDEX idx_outbound_contacts_email_unique ON public.outbound_contacts (LOWER(email)) WHERE email IS NOT NULL AND email != '';

-- Phone index for secondary matching
CREATE INDEX idx_outbound_contacts_phone ON public.outbound_contacts (phone) WHERE phone IS NOT NULL AND phone != '';

-- Composite index for tertiary matching
CREATE INDEX idx_outbound_contacts_name_company ON public.outbound_contacts (LOWER(contact_name), LOWER(company_name));

-- Upload logs
CREATE TABLE public.outbound_upload_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  new_records INTEGER NOT NULL DEFAULT 0,
  updated_records INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  failed_details JSONB,
  uploaded_by TEXT NOT NULL,
  uploaded_by_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Review queue for conflicts
CREATE TABLE public.outbound_review_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_data JSONB NOT NULL,
  conflict_type TEXT NOT NULL,
  matched_contact_id UUID REFERENCES public.outbound_contacts(id),
  resolution TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.outbound_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_upload_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_review_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for outbound_contacts
CREATE POLICY "Authenticated users can view outbound contacts" ON public.outbound_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert outbound contacts" ON public.outbound_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update outbound contacts" ON public.outbound_contacts FOR UPDATE TO authenticated USING (true);

-- RLS policies for upload logs
CREATE POLICY "Authenticated users can view upload logs" ON public.outbound_upload_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert upload logs" ON public.outbound_upload_logs FOR INSERT TO authenticated WITH CHECK (true);

-- RLS policies for review queue
CREATE POLICY "Authenticated users can view review queue" ON public.outbound_review_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert review queue" ON public.outbound_review_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update review queue" ON public.outbound_review_queue FOR UPDATE TO authenticated USING (true);

-- Updated_at trigger
CREATE TRIGGER update_outbound_contacts_updated_at
  BEFORE UPDATE ON public.outbound_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
