
-- =========================================================
-- 1) employees: prevent employees editing sensitive fields
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_employee_sensitive_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean;
BEGIN
  -- Service role / no auth context (background jobs, migrations) — allow.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_privileged := public.has_role(v_uid,'admin'::app_role)
               OR public.has_role(v_uid,'hr'::app_role)
               OR public.has_role(v_uid,'finance'::app_role);

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- Non-privileged callers editing anyone's row (should be their own via RLS)
  -- must not touch sensitive/payroll/employment fields.
  IF NEW.monthly_salary IS DISTINCT FROM OLD.monthly_salary
     OR NEW.bank_account IS DISTINCT FROM OLD.bank_account
     OR NEW.ifsc_code   IS DISTINCT FROM OLD.ifsc_code
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.department  IS DISTINCT FROM OLD.department
     OR NEW.manager_id  IS DISTINCT FROM OLD.manager_id
     OR NEW.is_active   IS DISTINCT FROM OLD.is_active
     OR NEW.user_id     IS DISTINCT FROM OLD.user_id
     OR NEW.status      IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'Only HR, Finance, or Admin can modify payroll, banking, employment, or activation fields on employee records';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_employee_sensitive_fields ON public.employees;
CREATE TRIGGER trg_protect_employee_sensitive_fields
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.protect_employee_sensitive_fields();


-- =========================================================
-- 2) portal_contacts: only portal admins / internal staff
--    may change the role column
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_portal_contact_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_caller_role text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  v_is_internal := public.has_role(v_uid,'admin'::app_role)
                OR public.has_role(v_uid,'supply_chain'::app_role)
                OR public.has_role(v_uid,'support'::app_role);

  IF v_is_internal THEN
    RETURN NEW;
  END IF;

  -- Portal caller: only a portal contact whose OWN role is 'admin' within the
  -- same account may change any contact's role.
  SELECT pc.role INTO v_caller_role
    FROM public.portal_contacts pc
   WHERE pc.auth_user_id = v_uid
     AND pc.account_id  = NEW.account_id
     AND pc.is_active   = true
   LIMIT 1;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only a portal account admin or internal staff can change a contact role';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_portal_contact_role ON public.portal_contacts;
CREATE TRIGGER trg_protect_portal_contact_role
  BEFORE UPDATE OF role ON public.portal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.protect_portal_contact_role();


-- =========================================================
-- 3) sales_daily_activities: strip self-reported bonus /
--    pipeline figures for non-privileged writers
-- =========================================================
CREATE OR REPLACE FUNCTION public.protect_sales_activity_bonus_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_privileged := public.has_role(v_uid,'admin'::app_role)
               OR public.has_role(v_uid,'finance'::app_role);

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  -- For non-privileged writers (sales reps editing their own row):
  -- on INSERT, force compensation-relevant fields to zero.
  -- on UPDATE, keep the previously stored value — reps cannot change them.
  IF TG_OP = 'INSERT' THEN
    NEW.bonus_earned           := 0;
    NEW.payment_expected_today := 0;
    NEW.sweet_pipeline         := 0;
    NEW.monthly_pipeline       := 0;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.bonus_earned           := OLD.bonus_earned;
    NEW.payment_expected_today := OLD.payment_expected_today;
    NEW.sweet_pipeline         := OLD.sweet_pipeline;
    NEW.monthly_pipeline       := OLD.monthly_pipeline;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_sales_activity_bonus_fields ON public.sales_daily_activities;
CREATE TRIGGER trg_protect_sales_activity_bonus_fields
  BEFORE INSERT OR UPDATE ON public.sales_daily_activities
  FOR EACH ROW EXECUTE FUNCTION public.protect_sales_activity_bonus_fields();
