
-- 1. Fix meetings IDOR vulnerability
DROP POLICY IF EXISTS "Users can update meetings" ON public.meetings;

CREATE POLICY "Users can update own meetings"
ON public.meetings FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    owner_id = auth.uid() OR
    host_id = auth.uid() OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'sales_manager')
  )
);

-- 2. Create interakt_leads table
CREATE TABLE public.interakt_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+91',
  email TEXT,
  source TEXT NOT NULL DEFAULT 'Interakt',
  status TEXT NOT NULL DEFAULT 'new',
  interakt_user_id TEXT,
  interakt_traits JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_phone_number UNIQUE (phone_number)
);

-- Create index on phone_number for fast duplicate checks
CREATE INDEX idx_interakt_leads_phone ON public.interakt_leads (phone_number);
CREATE INDEX idx_interakt_leads_source ON public.interakt_leads (source);
CREATE INDEX idx_interakt_leads_status ON public.interakt_leads (status);

-- Enable RLS
ALTER TABLE public.interakt_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated approved users can read
CREATE POLICY "Approved users can view interakt leads"
ON public.interakt_leads FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

-- Only admin, sales_manager, sales can insert
CREATE POLICY "Authorized roles can insert interakt leads"
ON public.interakt_leads FOR INSERT
TO authenticated
WITH CHECK (
  is_user_approved(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'sales_manager') OR
    public.has_role(auth.uid(), 'sales')
  )
);

-- Only admin, sales_manager can update
CREATE POLICY "Authorized roles can update interakt leads"
ON public.interakt_leads FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'sales_manager')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_interakt_leads_updated_at
  BEFORE UPDATE ON public.interakt_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
