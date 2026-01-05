-- Drop existing restrictive SELECT policies on orders
DROP POLICY IF EXISTS "Supply chain can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admin can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Sales can view own orders" ON public.orders;

-- Recreate as PERMISSIVE policies (default behavior, only ONE needs to pass)
CREATE POLICY "Supply chain can view all orders" 
ON public.orders 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'supply_chain'::app_role));

CREATE POLICY "Admin can view all orders" 
ON public.orders 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales can view own orders" 
ON public.orders 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'sales'::app_role) AND (sales_person_id = auth.uid()));