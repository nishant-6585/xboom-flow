
-- 1) expenses: lock approval/payment fields for self-updates
DROP POLICY IF EXISTS "Users can update own expenses or admin/finance can update any" ON public.expenses;

CREATE POLICY "expenses_admin_finance_update_any"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role)
);

CREATE POLICY "expenses_self_update_locked_fields"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  created_by = (auth.uid())::text
  AND NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'finance'::app_role))
)
WITH CHECK (
  created_by = (auth.uid())::text
  AND (SELECT e.status               FROM public.expenses e WHERE e.id = expenses.id) IS NOT DISTINCT FROM status
  AND (SELECT e.approved_by          FROM public.expenses e WHERE e.id = expenses.id) IS NOT DISTINCT FROM approved_by
  AND (SELECT e.approved_by_name     FROM public.expenses e WHERE e.id = expenses.id) IS NOT DISTINCT FROM approved_by_name
  AND (SELECT e.approved_at          FROM public.expenses e WHERE e.id = expenses.id) IS NOT DISTINCT FROM approved_at
  AND (SELECT e.amount_paid          FROM public.expenses e WHERE e.id = expenses.id) IS NOT DISTINCT FROM amount_paid
  AND (SELECT e.paid_from_petty_cash FROM public.expenses e WHERE e.id = expenses.id) IS NOT DISTINCT FROM paid_from_petty_cash
);

-- 2) quotes: lock approval fields for sales self-updates
DROP POLICY IF EXISTS "Sales can update own quotes" ON public.quotes;

CREATE POLICY "Sales can update own quotes"
ON public.quotes
FOR UPDATE
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND created_by = auth.uid()
)
WITH CHECK (
  is_user_approved(auth.uid())
  AND has_role(auth.uid(), 'sales'::app_role)
  AND created_by = auth.uid()
  AND (SELECT q.status           FROM public.quotes q WHERE q.id = quotes.id) IS NOT DISTINCT FROM status
  AND (SELECT q.approved_by      FROM public.quotes q WHERE q.id = quotes.id) IS NOT DISTINCT FROM approved_by
  AND (SELECT q.approved_by_name FROM public.quotes q WHERE q.id = quotes.id) IS NOT DISTINCT FROM approved_by_name
  AND (SELECT q.approved_at      FROM public.quotes q WHERE q.id = quotes.id) IS NOT DISTINCT FROM approved_at
);

-- 3) resignation_requests: lock HR-approval fields for self-updates
DROP POLICY IF EXISTS resignation_requests_update ON public.resignation_requests;

CREATE POLICY resignation_requests_update_hr_admin
ON public.resignation_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'hr'::app_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'hr'::app_role])
  )
);

CREATE POLICY resignation_requests_update_self_locked
ON public.resignation_requests
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'hr'::app_role])
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND (SELECT r.status           FROM public.resignation_requests r WHERE r.id = resignation_requests.id) IS NOT DISTINCT FROM status
  AND (SELECT r.approved_lwd     FROM public.resignation_requests r WHERE r.id = resignation_requests.id) IS NOT DISTINCT FROM approved_lwd
  AND (SELECT r.reviewed_by      FROM public.resignation_requests r WHERE r.id = resignation_requests.id) IS NOT DISTINCT FROM reviewed_by
  AND (SELECT r.reviewed_by_name FROM public.resignation_requests r WHERE r.id = resignation_requests.id) IS NOT DISTINCT FROM reviewed_by_name
  AND (SELECT r.reviewed_at      FROM public.resignation_requests r WHERE r.id = resignation_requests.id) IS NOT DISTINCT FROM reviewed_at
  AND (SELECT r.hr_notes         FROM public.resignation_requests r WHERE r.id = resignation_requests.id) IS NOT DISTINCT FROM hr_notes
);

-- 4) meetings: scope broad "approved users" visibility to team-visible meetings only
DROP POLICY IF EXISTS "Approved users can view meetings" ON public.meetings;

CREATE POLICY "Approved users can view team meetings"
ON public.meetings
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND visibility = 'team'
);
