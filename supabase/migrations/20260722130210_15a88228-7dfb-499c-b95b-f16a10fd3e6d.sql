
CREATE OR REPLACE FUNCTION public.kyc_audit_stamp_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.actor_id := COALESCE(NEW.actor_id, auth.uid());
  IF public.is_kyc_reviewer(auth.uid()) THEN
    NEW.actor_role := 'reviewer';
  ELSIF NEW.account_id = public.get_my_portal_account_id() THEN
    NEW.actor_role := 'customer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_audit_stamp_actor ON public.kyc_audit_log;
CREATE TRIGGER trg_kyc_audit_stamp_actor
BEFORE INSERT ON public.kyc_audit_log
FOR EACH ROW EXECUTE FUNCTION public.kyc_audit_stamp_actor();

DROP POLICY IF EXISTS "kyc_audit_insert_customer" ON public.kyc_audit_log;
CREATE POLICY "kyc_audit_insert_customer"
ON public.kyc_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  account_id = public.get_my_portal_account_id()
  AND action = ANY (ARRAY[
    'document_uploaded','aadhaar_submitted',
    'digilocker_initiated','digilocker_completed'
  ])
);

CREATE OR REPLACE FUNCTION public.is_internal_directory_viewer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin'::app_role,
        'hr'::app_role,
        'sales'::app_role,
        'sales_manager'::app_role,
        'finance'::app_role,
        'it'::app_role,
        'supply_chain'::app_role,
        'marketing'::app_role,
        'support'::app_role
      )
  );
$$;

DROP POLICY IF EXISTS "Approved users can view approved profiles" ON public.profiles;
CREATE POLICY "Internal directory viewers can view approved profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_approved = true
  AND public.is_user_approved(auth.uid())
  AND public.is_internal_directory_viewer(auth.uid())
);
