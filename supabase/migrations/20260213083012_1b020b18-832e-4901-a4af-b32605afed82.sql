
-- Create a dedicated table for public drone repair enquiries
CREATE TABLE public.drone_repair_enquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  drone_model TEXT NOT NULL,
  drone_category TEXT NOT NULL DEFAULT 'Consumer',
  serial_number TEXT,
  issue_type TEXT NOT NULL DEFAULT 'other',
  issue_description TEXT NOT NULL,
  purchase_date TEXT,
  is_under_warranty BOOLEAN DEFAULT false,
  preferred_date TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  assigned_to UUID,
  assigned_to_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drone_repair_enquiries ENABLE ROW LEVEL SECURITY;

-- PUBLIC INSERT policy - anyone can submit an enquiry (no auth required)
CREATE POLICY "Anyone can submit drone repair enquiry"
ON public.drone_repair_enquiries
FOR INSERT
WITH CHECK (true);

-- Only authenticated approved users can SELECT
CREATE POLICY "Authenticated users can view enquiries"
ON public.drone_repair_enquiries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND is_approved = true
  )
);

-- Only admin/supply_chain can UPDATE
CREATE POLICY "Admin and supply chain can update enquiries"
ON public.drone_repair_enquiries
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'supply_chain')
  )
);

-- Only admin can DELETE
CREATE POLICY "Admin can delete enquiries"
ON public.drone_repair_enquiries
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_drone_repair_enquiries_updated_at
BEFORE UPDATE ON public.drone_repair_enquiries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Notification trigger for new enquiries
CREATE OR REPLACE FUNCTION public.notify_on_drone_repair_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (type, title, message, target_role)
  VALUES (
    'hot_lead',
    '🔧 New Drone Repair Enquiry',
    format(
      '%s - %s (%s). Issue: %s. Phone: %s',
      NEW.customer_name,
      NEW.drone_model,
      NEW.drone_category,
      NEW.issue_type,
      NEW.phone
    ),
    NULL
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_drone_repair_enquiry
AFTER INSERT ON public.drone_repair_enquiries
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_drone_repair_enquiry();
