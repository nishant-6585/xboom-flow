-- 1) Shared classifier for restricted lead categories (fail-closed for NULL page_url)
CREATE OR REPLACE FUNCTION public.is_restricted_lead(
  _page_url text,
  _form_type text,
  _subject text,
  _message text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    -- explicit restricted landing pages
    (_page_url ILIKE '%sell-your-used-drones%'
      OR _page_url ILIKE '%rent-a-drone%'
      OR _page_url ILIKE '%drone-repair%')
    OR
    -- no page url: classify by form type / free text (fail-closed)
    (_page_url IS NULL AND (
      COALESCE(_form_type, '') ILIKE '%repair%'
      OR COALESCE(_form_type, '') ILIKE '%buyback%'
      OR COALESCE(_form_type, '') ILIKE '%buy-back%'
      OR COALESCE(_form_type, '') ILIKE '%rent%'
      OR COALESCE(_form_type, '') ILIKE '%used%'
      OR COALESCE(_form_type, '') ILIKE '%sell%'
      OR COALESCE(_subject, '') ILIKE '%drone repair%'
      OR COALESCE(_subject, '') ILIKE '%rent a drone%'
      OR COALESCE(_subject, '') ILIKE '%sell%used%drone%'
      OR COALESCE(_message, '') ILIKE '%drone repair%'
      OR COALESCE(_message, '') ILIKE '%rent a drone%'
      OR COALESCE(_message, '') ILIKE '%sell%used%drone%'
    ))
$$;

DROP POLICY IF EXISTS leads_select_sales_admin ON public.leads;
DROP POLICY IF EXISTS leads_select_website_forms_restricted ON public.leads;

CREATE POLICY leads_select_sales_admin
ON public.leads
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
      AND NOT public.is_restricted_lead(page_url, form_type, subject, message)
    )
  )
);

CREATE POLICY leads_select_website_forms_restricted
ON public.leads
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid())
  AND public.is_restricted_lead(page_url, form_type, subject, message)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  )
);

-- 2) attribution_field_audit: read-only for CRM roles, writes only via triggers/service role
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attribution_field_audit FROM authenticated, anon;
GRANT SELECT ON public.attribution_field_audit TO authenticated;
GRANT ALL ON public.attribution_field_audit TO service_role;

DROP POLICY IF EXISTS "No client writes to attribution field audit" ON public.attribution_field_audit;
CREATE POLICY "No client writes to attribution field audit"
ON public.attribution_field_audit
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (false);

-- 3) portal_notification_preferences: explicit INSERT policy for the owning contact
DROP POLICY IF EXISTS "portal_prefs: contact inserts own" ON public.portal_notification_preferences;
CREATE POLICY "portal_prefs: contact inserts own"
ON public.portal_notification_preferences
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portal_contacts c
    WHERE c.id = portal_notification_preferences.contact_id
      AND c.auth_user_id = auth.uid()
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_notification_preferences TO authenticated;
GRANT ALL ON public.portal_notification_preferences TO service_role;