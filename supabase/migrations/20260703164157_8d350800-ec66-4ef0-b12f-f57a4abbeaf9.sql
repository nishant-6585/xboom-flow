-- Tighten RLS: prevent sales reps from reassigning google_ads_leads and from creating RFQs for accounts they don't own
DROP POLICY IF EXISTS "Sales can update assigned google_ads_leads" ON public.google_ads_leads;
CREATE POLICY "Sales can update assigned google_ads_leads"
ON public.google_ads_leads
FOR UPDATE
USING (sales_person_id = auth.uid())
WITH CHECK (sales_person_id = auth.uid());

DROP POLICY IF EXISTS "portal_rfqs: rep manages assigned" ON public.portal_rfqs;
CREATE POLICY "portal_rfqs: rep manages assigned"
ON public.portal_rfqs
FOR ALL
USING (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  AND (
    (assigned_rep_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM portal_accounts a
      WHERE a.id = portal_rfqs.account_id AND a.assigned_rep_id = auth.uid()
    )
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
  AND (
    (assigned_rep_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM portal_accounts a
      WHERE a.id = portal_rfqs.account_id AND a.assigned_rep_id = auth.uid()
    )
  )
);