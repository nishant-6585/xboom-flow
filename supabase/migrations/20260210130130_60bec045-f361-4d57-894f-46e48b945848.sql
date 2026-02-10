
-- Create buyback_drones table
CREATE TABLE public.buyback_drones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  drone_category TEXT NOT NULL CHECK (drone_category IN ('Mini', 'Air', 'Mavic', 'FPV', 'Enterprise', 'Other')),
  drone_model TEXT NOT NULL,
  serial_number TEXT NOT NULL UNIQUE,
  condition TEXT NOT NULL CHECK (condition IN ('New', 'Used', 'Repaired')),
  buyback_price NUMERIC NOT NULL,
  seller_name TEXT NOT NULL,
  seller_contact TEXT NOT NULL,
  buyback_date DATE NOT NULL DEFAULT CURRENT_DATE,
  selling_price NUMERIC,
  buyer_name TEXT,
  buyer_contact TEXT,
  selling_date DATE,
  stock_status TEXT NOT NULL DEFAULT 'In Stock' CHECK (stock_status IN ('In Stock', 'Sold Out')),
  profit_loss NUMERIC GENERATED ALWAYS AS (selling_price - buyback_price) STORED,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.buyback_drones ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view all drones"
  ON public.buyback_drones FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert drones"
  ON public.buyback_drones FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update drones"
  ON public.buyback_drones FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete drones"
  ON public.buyback_drones FOR DELETE
  USING (auth.role() = 'authenticated');

-- Auto-update timestamp trigger
CREATE TRIGGER update_buyback_drones_updated_at
  BEFORE UPDATE ON public.buyback_drones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-set stock_status on resale
CREATE OR REPLACE FUNCTION public.auto_set_drone_stock_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.selling_price IS NOT NULL AND NEW.buyer_name IS NOT NULL AND NEW.selling_date IS NOT NULL THEN
    NEW.stock_status := 'Sold Out';
  ELSE
    NEW.stock_status := 'In Stock';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_drone_stock_status
  BEFORE INSERT OR UPDATE ON public.buyback_drones
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_drone_stock_status();
