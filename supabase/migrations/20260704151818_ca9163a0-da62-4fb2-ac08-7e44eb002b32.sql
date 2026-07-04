-- Fix portal_documents: mirror ownership check into WITH CHECK
DROP POLICY IF EXISTS "portal_documents: rep manages assigned" ON public.portal_documents;
CREATE POLICY "portal_documents: rep manages assigned"
ON public.portal_documents
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM portal_orders o
    WHERE o.id = portal_documents.order_id AND o.assigned_rep_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  AND order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM portal_orders o
    WHERE o.id = portal_documents.order_id AND o.assigned_rep_id = auth.uid()
  )
);

-- Fix portal_tickets: mirror ownership check into WITH CHECK
DROP POLICY IF EXISTS "portal_tickets: rep manages assigned customers" ON public.portal_tickets;
CREATE POLICY "portal_tickets: rep manages assigned customers"
ON public.portal_tickets
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM portal_accounts a
    WHERE a.id = portal_tickets.account_id AND a.assigned_rep_id = auth.uid()
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM portal_accounts a
    WHERE a.id = portal_tickets.account_id AND a.assigned_rep_id = auth.uid()
  )
);

-- Fix tasks: add WITH CHECK matching USING so users cannot reassign tasks away from themselves
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
CREATE POLICY "Users can update own tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (is_user_approved(auth.uid()) AND (assigned_to = auth.uid()))
WITH CHECK (is_user_approved(auth.uid()) AND (assigned_to = auth.uid()));