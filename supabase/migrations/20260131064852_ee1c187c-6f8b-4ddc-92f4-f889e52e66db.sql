-- Create quote status enum
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');

-- Create quotes table
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_number TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  customer_company TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_gst TEXT,
  customer_state TEXT,
  
  -- Financials
  subtotal NUMERIC DEFAULT 0,
  total_gst NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  
  -- Metadata
  status quote_status NOT NULL DEFAULT 'draft',
  valid_until DATE,
  notes TEXT,
  terms_and_conditions TEXT,
  
  -- Source reference
  source_type TEXT, -- 'enquiry', 'pipeline', 'manual'
  source_id UUID,
  
  -- Audit
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quote items table
CREATE TABLE public.quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_code TEXT,
  product_category TEXT DEFAULT 'Consumer Drones',
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  gst_percent NUMERIC DEFAULT 18,
  gst_amount NUMERIC DEFAULT 0,
  price_includes_gst BOOLEAN DEFAULT false,
  total_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence for quote numbers
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

-- Function to generate quote number
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'QT-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('quote_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for quote number
CREATE TRIGGER set_quote_number
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quotes
CREATE POLICY "Admin can manage all quotes"
  ON public.quotes FOR ALL
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales can view and create own quotes"
  ON public.quotes FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND created_by = auth.uid());

CREATE POLICY "Sales can create quotes"
  ON public.quotes FOR INSERT
  WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND created_by = auth.uid());

CREATE POLICY "Sales can update own quotes"
  ON public.quotes FOR UPDATE
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND created_by = auth.uid());

CREATE POLICY "Supply chain can view all quotes"
  ON public.quotes FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Finance can view all quotes"
  ON public.quotes FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- RLS Policies for quote items
CREATE POLICY "Users can manage quote items for their quotes"
  ON public.quote_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q 
      WHERE q.id = quote_items.quote_id 
      AND (
        has_role(auth.uid(), 'admin'::app_role) 
        OR (has_role(auth.uid(), 'sales'::app_role) AND q.created_by = auth.uid())
      )
    )
  );

CREATE POLICY "Supply chain can view quote items"
  ON public.quote_items FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Finance can view quote items"
  ON public.quote_items FOR SELECT
  USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Update timestamp trigger
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();