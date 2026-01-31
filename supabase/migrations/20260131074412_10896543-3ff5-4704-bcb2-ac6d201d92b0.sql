-- Create asset type enum
CREATE TYPE asset_type AS ENUM ('mobile_phone', 'sim_card', 'laptop', 'camera', 'tablet', 'headset', 'monitor', 'keyboard', 'mouse', 'other');

-- Create asset status enum
CREATE TYPE asset_status AS ENUM ('assigned', 'returned', 'lost', 'damaged', 'under_repair');

-- Create employee_assets table
CREATE TABLE public.employee_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  asset_type asset_type NOT NULL,
  asset_name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  imei_number TEXT,
  sim_number TEXT,
  phone_number TEXT,
  purchase_date DATE,
  purchase_price NUMERIC,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  status asset_status NOT NULL DEFAULT 'assigned',
  condition_on_assign TEXT,
  condition_on_return TEXT,
  notes TEXT,
  assigned_by UUID,
  assigned_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all assets"
ON public.employee_assets
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own assets"
ON public.employee_assets
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND 
  employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
);

-- Create updated_at trigger
CREATE TRIGGER update_employee_assets_updated_at
BEFORE UPDATE ON public.employee_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();