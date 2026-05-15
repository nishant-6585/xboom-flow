CREATE OR REPLACE FUNCTION public.current_portal_contact_can_manage(_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.portal_contacts c
    WHERE c.auth_user_id = auth.uid()
      AND c.is_active = true
      AND c.account_id = _account_id
      AND c.role IN ('admin', 'buyer')
  )
$$;

DROP POLICY IF EXISTS "portal_contacts: customer admin manages own account" ON public.portal_contacts;
DROP POLICY IF EXISTS "portal_contacts: customer admin inserts own account" ON public.portal_contacts;
DROP POLICY IF EXISTS "portal_contacts: customer admin updates own account" ON public.portal_contacts;
DROP POLICY IF EXISTS "portal_contacts: customer admin deletes own account" ON public.portal_contacts;

CREATE POLICY "portal_contacts: customer admin inserts own account"
ON public.portal_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'b2b_customer')
  AND public.current_portal_contact_can_manage(account_id)
);

CREATE POLICY "portal_contacts: customer admin updates own account"
ON public.portal_contacts
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'b2b_customer')
  AND public.current_portal_contact_can_manage(account_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'b2b_customer')
  AND public.current_portal_contact_can_manage(account_id)
);

CREATE POLICY "portal_contacts: customer admin deletes own account"
ON public.portal_contacts
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'b2b_customer')
  AND public.current_portal_contact_can_manage(account_id)
);