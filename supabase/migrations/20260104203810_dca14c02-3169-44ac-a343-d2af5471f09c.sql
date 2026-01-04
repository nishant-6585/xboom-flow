-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Approved users can view all enquiries" ON public.enquiries;

-- Create new granular SELECT policies

-- Sales can only view their own enquiries
CREATE POLICY "Sales can view own enquiries" 
ON public.enquiries 
FOR SELECT 
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'sales'::app_role) 
  AND sales_person_id = auth.uid()
);

-- Supply chain can view all enquiries (they need to respond to them)
CREATE POLICY "Supply chain can view all enquiries" 
ON public.enquiries 
FOR SELECT 
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'supply_chain'::app_role)
);

-- Admin can view all enquiries
CREATE POLICY "Admin can view all enquiries" 
ON public.enquiries 
FOR SELECT 
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);