CREATE OR REPLACE FUNCTION public.guard_enquiries_sales_followup_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Privileged roles bypass the guard entirely
  IF v_uid IS NULL
     OR public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'supply_chain'::app_role)
     OR public.has_role(v_uid, 'sales_manager'::app_role)
  THEN
    RETURN NEW;
  END IF;

  -- Only enforce for sales users
  IF NOT public.has_role(v_uid, 'sales'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Sales user may only touch their OWN enquiries
  IF OLD.sales_person_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Sales users can only update their own enquiries'
      USING ERRCODE = '42501';
  END IF;

  -- Allow-list check: strip the allowed keys from both rows and compare the rest.
  -- If anything outside the allowed set changed, reject.
  IF (to_jsonb(NEW)
        - 'followup_note'
        - 'followup_note_updated_at'
        - 'followup_note_updated_by_name'
        - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD)
        - 'followup_note'
        - 'followup_note_updated_at'
        - 'followup_note_updated_by_name'
        - 'updated_at')
  THEN
    RAISE EXCEPTION 'Sales users may only update follow-up note fields on enquiries'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;