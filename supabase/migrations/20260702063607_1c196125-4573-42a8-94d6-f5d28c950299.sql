
-- =========================================================
-- 1) EMPLOYEES: prevent self-update of sensitive columns
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_employee_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- HR / Admin bypass all restrictions
  IF public.is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Only the owner can reach here via the self-update policy; still enforce
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to change user_id';
  END IF;

  IF NEW.monthly_salary IS DISTINCT FROM OLD.monthly_salary
     OR NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
     OR NEW.ifsc_code IS DISTINCT FROM OLD.ifsc_code
     OR NEW.pan_number IS DISTINCT FROM OLD.pan_number
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.designation IS DISTINCT FROM OLD.designation
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.date_of_joining IS DISTINCT FROM OLD.date_of_joining
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'Not allowed to change restricted employee fields (salary, bank, PAN, employment, designation, manager). Contact HR.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_self_update ON public.employees;
CREATE TRIGGER trg_guard_employee_self_update
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_self_update();

-- Add missing WITH CHECK on the self-update policy for defence-in-depth
DROP POLICY IF EXISTS "Users can update their own employee record" ON public.employees;
CREATE POLICY "Users can update their own employee record"
ON public.employees
FOR UPDATE
TO authenticated
USING ((user_id = auth.uid()) AND public.is_user_approved(auth.uid()))
WITH CHECK ((user_id = auth.uid()) AND public.is_user_approved(auth.uid()));


-- =========================================================
-- 2) PROFILES: prevent self-approval / role tampering
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to change user_id';
  END IF;

  IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    RAISE EXCEPTION 'Only admins can change approval status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- =========================================================
-- 3) USER_SESSIONS: protect integrity fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.guard_user_session_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.session_token_hash IS DISTINCT FROM OLD.session_token_hash
     OR NEW.session_version IS DISTINCT FROM OLD.session_version
     OR NEW.is_current IS DISTINCT FROM OLD.is_current
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
     OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.last_mfa_verified_at IS DISTINCT FROM OLD.last_mfa_verified_at
  THEN
    RAISE EXCEPTION 'Not allowed to modify session integrity fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_session_self_update ON public.user_sessions;
CREATE TRIGGER trg_guard_user_session_self_update
BEFORE UPDATE ON public.user_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_user_session_self_update();

DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
CREATE POLICY "Users can update own sessions"
ON public.user_sessions
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) AND public.is_user_approved(auth.uid()))
WITH CHECK ((auth.uid() = user_id) AND public.is_user_approved(auth.uid()));


-- =========================================================
-- 4) ENQUIRIES: sales must self-attribute on insert
-- =========================================================
DROP POLICY IF EXISTS "Sales and admin can create enquiries" ON public.enquiries;
CREATE POLICY "Sales and admin can create enquiries"
ON public.enquiries
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'sales'::app_role)
      AND sales_person_id = auth.uid()
    )
  )
);
