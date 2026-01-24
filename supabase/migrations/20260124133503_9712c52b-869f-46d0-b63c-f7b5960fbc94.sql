-- Create enum for issue types (if not exists)
DO $$ BEGIN
  CREATE TYPE public.repair_issue_type AS ENUM (
    'motor_failure',
    'gimbal_issue',
    'camera_damage',
    'battery_problem',
    'gps_issue',
    'remote_controller',
    'propeller_damage',
    'frame_damage',
    'flight_controller',
    'esc_issue',
    'software_issue',
    'water_damage',
    'crash_damage',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create enum for repair payment status (if not exists)
DO $$ BEGIN
  CREATE TYPE public.repair_payment_status AS ENUM ('pending', 'partial', 'paid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create repairs table
CREATE TABLE public.repairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repair_number TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  date_of_receipt DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_no TEXT NOT NULL,
  issue_details TEXT,
  issue_type repair_issue_type NOT NULL DEFAULT 'other',
  components_replaced JSONB DEFAULT '[]'::jsonb,
  total_component_cost NUMERIC(10,2) DEFAULT 0,
  inspection_charges NUMERIC(10,2) DEFAULT 0,
  repair_cost_charged NUMERIC(10,2) DEFAULT 0,
  date_completed DATE,
  days_to_complete INTEGER GENERATED ALWAYS AS (
    CASE WHEN date_completed IS NOT NULL THEN date_completed - date_of_receipt ELSE NULL END
  ) STORED,
  committed_date DATE,
  payment_status repair_payment_status NOT NULL DEFAULT 'pending',
  advance_amount NUMERIC(10,2) DEFAULT 0,
  total_quote_amount NUMERIC(10,2) DEFAULT 0,
  balance_amount NUMERIC(10,2) GENERATED ALWAYS AS (
    COALESCE(total_quote_amount, 0) - COALESCE(advance_amount, 0)
  ) STORED,
  profit NUMERIC(10,2) GENERATED ALWAYS AS (
    COALESCE(inspection_charges, 0) + COALESCE(repair_cost_charged, 0) - COALESCE(total_component_cost, 0)
  ) STORED,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Approved users can view repairs"
ON public.repairs FOR SELECT
USING (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can create repairs"
ON public.repairs FOR INSERT
WITH CHECK (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update repairs"
ON public.repairs FOR UPDATE
USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete repairs"
ON public.repairs FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_repairs_updated_at
BEFORE UPDATE ON public.repairs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate repair number
CREATE OR REPLACE FUNCTION public.generate_repair_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
  new_repair_number TEXT;
BEGIN
  IF NEW.repair_number IS NULL THEN
    year_prefix := TO_CHAR(NOW(), 'YY');
    
    LOCK TABLE public.repairs IN SHARE ROW EXCLUSIVE MODE;
    
    SELECT COALESCE(
      MAX(
        CASE 
          WHEN repair_number ~ ('^REP' || year_prefix || '[0-9]+$') 
          THEN CAST(SUBSTRING(repair_number FROM 6) AS INTEGER)
          ELSE 0
        END
      ), 0
    ) + 1
    INTO next_num
    FROM public.repairs
    WHERE repair_number LIKE 'REP' || year_prefix || '%';
    
    new_repair_number := 'REP' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    
    WHILE EXISTS (SELECT 1 FROM public.repairs WHERE repair_number = new_repair_number) LOOP
      next_num := next_num + 1;
      new_repair_number := 'REP' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    END LOOP;
    
    NEW.repair_number := new_repair_number;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for repair number generation
CREATE TRIGGER generate_repair_number_trigger
BEFORE INSERT ON public.repairs
FOR EACH ROW
EXECUTE FUNCTION public.generate_repair_number();