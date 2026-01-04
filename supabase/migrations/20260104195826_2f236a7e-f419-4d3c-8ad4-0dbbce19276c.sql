-- Create enquiries table
CREATE TABLE public.enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_company TEXT NOT NULL,
  sales_person_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sales_person_name TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'confirmed', 'rejected')),
  response_pricing TEXT,
  response_availability TEXT,
  response_lead_time TEXT,
  responded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

-- Everyone approved can view all enquiries
CREATE POLICY "Approved users can view all enquiries"
ON public.enquiries FOR SELECT
USING (public.is_user_approved(auth.uid()));

-- Sales team can create enquiries
CREATE POLICY "Sales and admin can create enquiries"
ON public.enquiries FOR INSERT
WITH CHECK (
  public.is_user_approved(auth.uid()) AND 
  (public.has_role(auth.uid(), 'sales') OR public.has_role(auth.uid(), 'admin'))
);

-- Supply chain and admin can update enquiries (respond)
CREATE POLICY "Supply chain and admin can update enquiries"
ON public.enquiries FOR UPDATE
USING (
  public.is_user_approved(auth.uid()) AND 
  (public.has_role(auth.uid(), 'supply_chain') OR public.has_role(auth.uid(), 'admin'))
);

-- Only admin can delete enquiries
CREATE POLICY "Admin can delete enquiries"
ON public.enquiries FOR DELETE
USING (
  public.is_user_approved(auth.uid()) AND 
  public.has_role(auth.uid(), 'admin')
);

-- Trigger for updated_at
CREATE TRIGGER on_enquiries_updated
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime for enquiries
ALTER PUBLICATION supabase_realtime ADD TABLE public.enquiries;