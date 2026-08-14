CREATE OR REPLACE FUNCTION public.guard_pipeline_orders_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_privileged boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  is_privileged :=
       public.has_role(uid, 'admin'::app_role)
    OR public.has_role(uid, 'sales_manager'::app_role)
    OR public.has_role(uid, 'finance'::app_role);

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Sales reps may now update expected_price on their own deals.
  IF NEW.probability     IS DISTINCT FROM OLD.probability
  OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
  THEN
    RAISE EXCEPTION 'Sales reps cannot modify probability or ownership on pipeline deals. Ask a sales manager.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_pipeline_orders_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin'::app_role) OR public.has_role(uid, 'sales_manager'::app_role) THEN
    RETURN NEW;
  END IF;

  -- expected_price is now editable by the owning sales rep.
  IF NEW.probability        IS DISTINCT FROM OLD.probability
  OR NEW.lost_reason        IS DISTINCT FROM OLD.lost_reason
  OR NEW.sales_person_id    IS DISTINCT FROM OLD.sales_person_id
  OR NEW.sales_person_name  IS DISTINCT FROM OLD.sales_person_name
  THEN
    RAISE EXCEPTION 'Only admin or sales manager can modify ownership or lost reason on pipeline_orders.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;