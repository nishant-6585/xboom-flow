
-- Companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'customer')),
  total_order_value NUMERIC DEFAULT 0,
  total_orders_count INTEGER DEFAULT 0,
  is_recurring BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view companies"
ON public.companies FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can create companies"
ON public.companies FOR INSERT TO authenticated
WITH CHECK (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update companies"
ON public.companies FOR UPDATE TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can delete companies"
ON public.companies FOR DELETE TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Company Contacts table
CREATE TABLE public.company_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view company contacts"
ON public.company_contacts FOR SELECT TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can create company contacts"
ON public.company_contacts FOR INSERT TO authenticated
WITH CHECK (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update company contacts"
ON public.company_contacts FOR UPDATE TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE POLICY "Approved users can delete company contacts"
ON public.company_contacts FOR DELETE TO authenticated
USING (public.is_user_approved(auth.uid()));

CREATE TRIGGER update_company_contacts_updated_at
BEFORE UPDATE ON public.company_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add company_id to prospects
ALTER TABLE public.prospects ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX idx_prospects_company_id ON public.prospects(company_id);

-- Add company_id to orders
ALTER TABLE public.orders ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_company_id ON public.orders(company_id);

-- Function to sync company order stats
CREATE OR REPLACE FUNCTION public.sync_company_order_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id UUID;
  v_total_value NUMERIC;
  v_total_count INTEGER;
  v_is_recurring BOOLEAN;
  v_has_won BOOLEAN;
BEGIN
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  IF v_company_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(total_sales_amount), 0), COUNT(*)
  INTO v_total_value, v_total_count
  FROM public.orders
  WHERE company_id = v_company_id AND status != 'cancelled';

  v_is_recurring := v_total_count >= 2;
  
  v_has_won := EXISTS (
    SELECT 1 FROM public.orders 
    WHERE company_id = v_company_id 
    AND status NOT IN ('cancelled', 'lost')
  );

  UPDATE public.companies
  SET total_order_value = v_total_value,
      total_orders_count = v_total_count,
      is_recurring = v_is_recurring,
      status = CASE WHEN v_has_won THEN 'customer' ELSE 'lead' END,
      updated_at = now()
  WHERE id = v_company_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_company_stats_on_order
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_company_order_stats();

-- Indexes
CREATE INDEX idx_companies_status ON public.companies(status);
CREATE INDEX idx_companies_name ON public.companies(name);
CREATE INDEX idx_company_contacts_company_id ON public.company_contacts(company_id);
