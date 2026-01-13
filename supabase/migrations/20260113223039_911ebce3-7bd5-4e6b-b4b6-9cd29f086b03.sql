-- Add RLS policies for Finance role on payment_records table
CREATE POLICY "Finance can view all payment records" 
ON public.payment_records 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can update payment records" 
ON public.payment_records 
FOR UPDATE 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Add RLS policies for Finance role on orders table (view for payment context)
CREATE POLICY "Finance can view all orders" 
ON public.orders 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Add RLS policies for Finance role on supplier_payments table
CREATE POLICY "Finance can view supplier payments" 
ON public.supplier_payments 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can create supplier payments" 
ON public.supplier_payments 
FOR INSERT 
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can update supplier payments" 
ON public.supplier_payments 
FOR UPDATE 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Add RLS policies for Finance role on inventory_procurements (view for payment context)
CREATE POLICY "Finance can view all inventory procurements" 
ON public.inventory_procurements 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Add RLS policies for Finance role on procurement_payment_requests
CREATE POLICY "Finance can view payment requests" 
ON public.procurement_payment_requests 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can update payment requests" 
ON public.procurement_payment_requests 
FOR UPDATE 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Add RLS policies for Finance role on suppliers (view for payment context)
CREATE POLICY "Finance can view all suppliers" 
ON public.suppliers 
FOR SELECT 
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'finance'::app_role));

-- Add RLS policies for Finance role on notifications
CREATE POLICY "Finance can view payment notifications" 
ON public.notifications 
FOR SELECT 
USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'finance'::app_role)))) AND ((target_role IS NULL) OR (target_role = 'finance'::text) OR (target_role = 'supply_chain'::text)));

CREATE POLICY "Finance can update notifications" 
ON public.notifications 
FOR UPDATE 
USING (EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'finance'::app_role))));