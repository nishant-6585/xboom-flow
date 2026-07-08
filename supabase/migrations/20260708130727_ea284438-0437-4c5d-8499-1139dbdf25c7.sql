
-- 1) kyc_audit_log: constrain customer-side inserts to safe actions
DROP POLICY IF EXISTS kyc_audit_insert ON public.kyc_audit_log;

CREATE POLICY kyc_audit_insert_reviewer
ON public.kyc_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_kyc_reviewer(auth.uid()));

CREATE POLICY kyc_audit_insert_customer
ON public.kyc_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  account_id = public.get_my_portal_account_id()
  AND actor_role = 'customer'
  AND action IN (
    'document_uploaded',
    'aadhaar_submitted',
    'digilocker_initiated',
    'digilocker_completed'
  )
);

-- 2) profiles: block self-spoofing of identity fields
CREATE OR REPLACE FUNCTION public.profiles_self_update_identity_lock()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.profiles;
BEGIN
  -- Admin/HR bypass — they can edit identity fields on any profile
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'hr'::app_role) THEN
    RETURN true;
  END IF;

  SELECT * INTO existing FROM public.profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN true; -- initial insert path handled by separate policy
  END IF;

  -- For self-updates, name/email/slack_user_id must remain unchanged
  RETURN true; -- placeholder, real check is inline in policy via row comparison
END;
$$;

-- Replace the self-update policy with one that pins identity fields to their current values
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND COALESCE(is_approved, false) = (
    SELECT COALESCE(p.is_approved, false) FROM public.profiles p WHERE p.user_id = auth.uid()
  )
  AND name IS NOT DISTINCT FROM (
    SELECT p.name FROM public.profiles p WHERE p.user_id = auth.uid()
  )
  AND email IS NOT DISTINCT FROM (
    SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid()
  )
  AND slack_user_id IS NOT DISTINCT FROM (
    SELECT p.slack_user_id FROM public.profiles p WHERE p.user_id = auth.uid()
  )
);
