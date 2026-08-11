CREATE OR REPLACE FUNCTION public.guard_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_hr_or_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to change user_id';
  END IF;

  IF NEW.monthly_salary IS DISTINCT FROM OLD.monthly_salary
     OR NEW.bank_account IS DISTINCT FROM OLD.bank_account
     OR NEW.ifsc_code IS DISTINCT FROM OLD.ifsc_code
     OR NEW.pan_number IS DISTINCT FROM OLD.pan_number
     OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.designation IS DISTINCT FROM OLD.designation
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Not allowed to change restricted employee fields (salary, bank, PAN, employment, designation, manager). Contact HR.';
  END IF;

  RETURN NEW;
END;
$function$;