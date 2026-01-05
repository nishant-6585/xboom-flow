-- Drop existing restrictive SELECT policies on suppliers
DROP POLICY IF EXISTS "Supply chain can view all suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admin can view all suppliers" ON public.suppliers;

-- Recreate as PERMISSIVE policies (default behavior, only ONE needs to pass)
CREATE POLICY "Supply chain can view all suppliers" 
ON public.suppliers 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can view all suppliers" 
ON public.suppliers 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));