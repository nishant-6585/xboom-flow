
-- 1) Protect sensitive profile columns from self-elevation
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to change anything
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot change is_approved
  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    RAISE EXCEPTION 'Only admins can change approval status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Remove duplicate INSERT policies
DROP POLICY IF EXISTS "Public can insert form views" ON public.form_views;
DROP POLICY IF EXISTS "Public can submit to active forms" ON public.form_submissions;

-- 3) Tighten enquiry_messages SELECT policy
DROP POLICY IF EXISTS "Approved users can view enquiry messages" ON public.enquiry_messages;

CREATE POLICY "Enquiry messages visible to participants and managers"
ON public.enquiry_messages
FOR SELECT
TO authenticated
USING (
  is_user_approved(auth.uid()) AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.enquiries e
      WHERE e.id = enquiry_messages.enquiry_id
        AND (e.sales_person_id = auth.uid() OR e.responded_by = auth.uid())
    )
  )
);
