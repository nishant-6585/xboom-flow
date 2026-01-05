-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create pricelist table
CREATE TABLE public.pricelist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL DEFAULT 'Consumer Drones',
  brand TEXT,
  description TEXT,
  unit_price NUMERIC,
  currency TEXT DEFAULT 'INR',
  availability TEXT DEFAULT 'In Stock',
  min_order_quantity INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.pricelist ENABLE ROW LEVEL SECURITY;

-- All approved users can view pricelist
CREATE POLICY "All approved users can view pricelist"
ON public.pricelist
FOR SELECT
USING (is_user_approved(auth.uid()));

-- Admin can manage pricelist
CREATE POLICY "Admin can manage pricelist"
ON public.pricelist
FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Supply chain can manage pricelist
CREATE POLICY "Supply chain can manage pricelist"
ON public.pricelist
FOR ALL
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_pricelist_updated_at
BEFORE UPDATE ON public.pricelist
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for pricelist Excel files
INSERT INTO storage.buckets (id, name, public) VALUES ('pricelist-uploads', 'pricelist-uploads', false);

-- Storage policies for pricelist uploads
CREATE POLICY "Admin can upload pricelist files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'pricelist-uploads' AND is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supply chain can upload pricelist files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'pricelist-uploads' AND is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Approved users can view pricelist files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'pricelist-uploads' AND is_user_approved(auth.uid()));