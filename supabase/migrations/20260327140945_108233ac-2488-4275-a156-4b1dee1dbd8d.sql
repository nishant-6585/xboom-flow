
-- Create email_leads table with same fields as enquiries + mail_source
CREATE TABLE public.email_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_company TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  city TEXT DEFAULT '',
  product_name TEXT DEFAULT '',
  product_code TEXT DEFAULT '',
  product_category TEXT DEFAULT 'Consumer Drones',
  quantity INTEGER DEFAULT 1,
  lead_source TEXT DEFAULT 'Email',
  mail_source TEXT NOT NULL DEFAULT 'hello@xboom.in',
  urgency TEXT DEFAULT 'medium',
  requested_timeline TEXT DEFAULT '',
  purpose_of_purchase TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  sales_person_id UUID,
  sales_person_name TEXT DEFAULT '',
  is_prospect BOOLEAN DEFAULT false,
  is_a_category BOOLEAN DEFAULT false,
  created_by UUID,
  created_by_name TEXT DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_leads_mail_source ON public.email_leads (mail_source);
CREATE INDEX idx_email_leads_status ON public.email_leads (status);
CREATE INDEX idx_email_leads_created_at ON public.email_leads (created_at);

-- Enable RLS
ALTER TABLE public.email_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Approved users can view email leads"
ON public.email_leads FOR SELECT
TO authenticated
USING (is_user_approved(auth.uid()));

CREATE POLICY "Authorized roles can insert email leads"
ON public.email_leads FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'sales_manager', 'sales', 'supply_chain')
  )
);

CREATE POLICY "Authorized roles can update email leads"
ON public.email_leads FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'sales_manager', 'sales', 'supply_chain')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_email_leads_updated_at
  BEFORE UPDATE ON public.email_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
