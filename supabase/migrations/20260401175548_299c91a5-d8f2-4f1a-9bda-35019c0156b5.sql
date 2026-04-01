
-- Create google_ads_leads table
CREATE TABLE public.google_ads_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL DEFAULT 'Google Ads Lead',
  customer_company TEXT DEFAULT 'Unknown',
  product_name TEXT DEFAULT 'Google Ads Enquiry',
  product_code TEXT,
  product_category TEXT DEFAULT 'Consumer Drones',
  quantity INTEGER DEFAULT 1,
  urgency TEXT DEFAULT 'medium',
  email TEXT,
  phone TEXT,
  city TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  lead_temperature TEXT DEFAULT 'warm',
  lead_source TEXT DEFAULT 'google_ads',
  google_lead_id TEXT UNIQUE,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_group_id TEXT,
  raw_google_payload JSONB,
  sales_person_id UUID,
  sales_person_name TEXT,
  is_converted BOOLEAN DEFAULT false,
  conversion_value NUMERIC DEFAULT 0,
  conversion_date TIMESTAMPTZ,
  order_outcome TEXT,
  is_prospect BOOLEAN DEFAULT false,
  is_a_category BOOLEAN DEFAULT false,
  customer_state TEXT,
  requested_timeline TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.google_ads_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage google_ads_leads" ON public.google_ads_leads
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Sales managers can view google_ads_leads" ON public.google_ads_leads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'sales_manager'));

CREATE POLICY "Sales can view assigned google_ads_leads" ON public.google_ads_leads
  FOR SELECT TO authenticated USING (sales_person_id = auth.uid());

CREATE POLICY "Sales can update assigned google_ads_leads" ON public.google_ads_leads
  FOR UPDATE TO authenticated USING (sales_person_id = auth.uid());

CREATE POLICY "Supply chain can view google_ads_leads" ON public.google_ads_leads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'supply_chain'));

CREATE INDEX idx_gal_google_lead_id ON public.google_ads_leads(google_lead_id);
CREATE INDEX idx_gal_campaign_id ON public.google_ads_leads(campaign_id);
CREATE INDEX idx_gal_sales_person ON public.google_ads_leads(sales_person_id);
CREATE INDEX idx_gal_created_at ON public.google_ads_leads(created_at DESC);

-- Migrate existing Google Ads leads from enquiries
INSERT INTO public.google_ads_leads (
  customer_name, customer_company, product_name, product_code, product_category,
  quantity, urgency, notes, status, lead_temperature, lead_source,
  google_lead_id, campaign_id, campaign_name, ad_group_id, raw_google_payload,
  sales_person_id, sales_person_name, is_converted, conversion_value,
  conversion_date, order_outcome, is_prospect, customer_state,
  requested_timeline, created_at, updated_at
)
SELECT 
  customer_name, customer_company, product_name, product_code, product_category,
  quantity, urgency, notes, status, lead_temperature, lead_source,
  google_lead_id, campaign_id, campaign_name, ad_group_id, raw_google_payload,
  sales_person_id, sales_person_name, is_converted, conversion_value,
  conversion_date, order_outcome, is_prospect, customer_state,
  requested_timeline, created_at, updated_at
FROM public.enquiries
WHERE lead_source = 'google_ads';

-- Remove Google Ads leads from enquiries
DELETE FROM public.enquiries WHERE lead_source = 'google_ads';
