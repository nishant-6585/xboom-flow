
-- Fix B2B_CUSTOMER_INTERNAL_DATA_EXPOSURE: add NOT b2b_customer role check to internal-only SELECT policies

-- ai_scoring_logs
DROP POLICY IF EXISTS "Approved users can view ai scoring logs" ON public.ai_scoring_logs;
CREATE POLICY "Approved internal users can view ai scoring logs"
ON public.ai_scoring_logs FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- domain_events
DROP POLICY IF EXISTS "Approved users can view domain events" ON public.domain_events;
CREATE POLICY "Approved internal users can view domain events"
ON public.domain_events FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- drone_operations
DROP POLICY IF EXISTS "drone_ops_read_only" ON public.drone_operations;
CREATE POLICY "drone_ops_read_only"
ON public.drone_operations FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- duplicate_alerts
DROP POLICY IF EXISTS "Approved users can view duplicate alerts" ON public.duplicate_alerts;
CREATE POLICY "Approved internal users can view duplicate alerts"
ON public.duplicate_alerts FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- edit_history
DROP POLICY IF EXISTS "All approved users can view edit history" ON public.edit_history;
CREATE POLICY "All approved internal users can view edit history"
ON public.edit_history FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- inventory
DROP POLICY IF EXISTS "All approved users can view inventory" ON public.inventory;
CREATE POLICY "All approved internal users can view inventory"
ON public.inventory FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- inventory_transactions
DROP POLICY IF EXISTS "All approved users can view inventory transactions" ON public.inventory_transactions;
CREATE POLICY "All approved internal users can view inventory transactions"
ON public.inventory_transactions FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- invoice_audit_logs
DROP POLICY IF EXISTS "Authenticated users can view invoice audit logs" ON public.invoice_audit_logs;
CREATE POLICY "Approved internal users can view invoice audit logs"
ON public.invoice_audit_logs FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- repair_stage_history
DROP POLICY IF EXISTS "Approved users can view stage history" ON public.repair_stage_history;
CREATE POLICY "Approved internal users can view stage history"
ON public.repair_stage_history FOR SELECT TO authenticated
USING (is_user_approved(auth.uid()) AND NOT has_role(auth.uid(), 'b2b_customer'::app_role));

-- Fix MISSING_APPROVAL_CHECK_ON_PUBLIC_READ on sales_faqs
DROP POLICY IF EXISTS "Authenticated users can view approved FAQs or their own" ON public.sales_faqs;
CREATE POLICY "Approved internal users can view sales FAQs"
ON public.sales_faqs FOR SELECT TO authenticated
USING (
  is_user_approved(auth.uid())
  AND NOT has_role(auth.uid(), 'b2b_customer'::app_role)
  AND (
    is_approved = true
    OR asked_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
