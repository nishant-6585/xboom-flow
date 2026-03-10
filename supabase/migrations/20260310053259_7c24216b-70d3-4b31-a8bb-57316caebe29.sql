
-- Drop all existing SELECT policies on orders
DROP POLICY IF EXISTS "Admin can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Finance can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Supply chain can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Sales can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Sales manager can view all orders" ON public.orders;

-- Create a single consolidated SELECT policy to prevent duplicates from overlapping permissive policies
CREATE POLICY "Users can view orders based on role" ON public.orders
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'finance'::app_role) OR
    has_role(auth.uid(), 'supply_chain'::app_role) OR
    has_role(auth.uid(), 'sales_manager'::app_role) OR
    (has_role(auth.uid(), 'sales'::app_role) AND sales_person_id = auth.uid())
  )
);
