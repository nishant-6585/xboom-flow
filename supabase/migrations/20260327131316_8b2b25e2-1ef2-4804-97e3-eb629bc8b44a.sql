
-- Create prospects table
CREATE TABLE public.prospects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('enquiry', 'interakt', 'myoperator')),
  source_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  company TEXT,
  city TEXT,
  product_name TEXT,
  notes TEXT,
  is_a_category BOOLEAN NOT NULL DEFAULT false,
  a_category_marked_at TIMESTAMPTZ,
  a_category_marked_by UUID,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost')),
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

-- Enable RLS
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/supply_chain/sales_manager see all, sales sees own
CREATE POLICY "Prospects visibility" ON public.prospects
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supply_chain')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR created_by = auth.uid()
);

CREATE POLICY "Prospects insert" ON public.prospects
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Prospects update" ON public.prospects
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'supply_chain')
  OR public.has_role(auth.uid(), 'sales_manager')
  OR created_by = auth.uid()
);

-- Add is_prospect and is_a_category columns to interakt_leads
ALTER TABLE public.interakt_leads 
  ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_a_category BOOLEAN DEFAULT false;

-- Add is_prospect and is_a_category columns to call_logs  
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_a_category BOOLEAN DEFAULT false;

-- Add is_prospect column to enquiries (is_mega_deal already serves as A-category)
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN DEFAULT false;

-- Trigger for points on prospect creation
CREATE OR REPLACE FUNCTION public.award_points_on_prospect_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 10 points for creating a prospect
  INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
  VALUES (
    NEW.created_by,
    10,
    'prospect_created',
    'Points for qualifying prospect: ' || NEW.customer_name,
    NEW.id
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_prospect_points
  AFTER INSERT ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.award_points_on_prospect_create();

-- Trigger for points on A-category marking
CREATE OR REPLACE FUNCTION public.award_points_on_a_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_a_category = true AND (OLD.is_a_category IS NULL OR OLD.is_a_category = false) THEN
    INSERT INTO public.sales_points (user_id, points, category, description, reference_id)
    VALUES (
      NEW.created_by,
      20,
      'a_category_created',
      'A-Category big deal: ' || NEW.customer_name,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_a_category_points
  AFTER UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.award_points_on_a_category();

-- Updated_at trigger
CREATE TRIGGER handle_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
