
-- 1) Fix mutable search_path on SECURITY DEFINER email queue functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 2) call_logs: scope sales SELECT to assigned rep only
DROP POLICY IF EXISTS "Role-scoped call log access" ON public.call_logs;
CREATE POLICY "Role-scoped call log access"
ON public.call_logs
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR sales_person_id = auth.uid()
  )
);

-- 3) contact_directory & contact_touchpoints: standardize on is_user_approved()
DROP POLICY IF EXISTS "directory_select_approved" ON public.contact_directory;
CREATE POLICY "directory_select_approved"
ON public.contact_directory
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "touchpoints_select_approved" ON public.contact_touchpoints;
CREATE POLICY "touchpoints_select_approved"
ON public.contact_touchpoints
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- 4) email_leads: scope sales SELECT to assigned rep only
DROP POLICY IF EXISTS "Privileged roles can view email leads" ON public.email_leads;
CREATE POLICY "Privileged roles can view email leads"
ON public.email_leads
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'sales_manager'::app_role)
  OR has_role(auth.uid(), 'supply_chain'::app_role)
  OR (has_role(auth.uid(), 'sales'::app_role) AND (
        assigned_to = auth.uid() OR sales_person_id = auth.uid()
      ))
);
