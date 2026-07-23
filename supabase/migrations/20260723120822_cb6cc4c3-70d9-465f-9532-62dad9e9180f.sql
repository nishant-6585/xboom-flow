CREATE OR REPLACE FUNCTION public.log_attribution_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_rpc_flag text;
  v_source_flag text;
  v_source text;
  v_session_user text := session_user;
BEGIN
  BEGIN v_rpc_flag := current_setting('app.attribution_rpc', true); EXCEPTION WHEN OTHERS THEN v_rpc_flag := NULL; END;
  BEGIN v_source_flag := current_setting('app.attribution_source', true); EXCEPTION WHEN OTHERS THEN v_source_flag := NULL; END;

  IF v_source_flag IS NOT NULL AND v_source_flag <> '' THEN
    v_source := v_source_flag;
  ELSIF v_rpc_flag = 'on' THEN
    v_source := 'rpc';
  ELSIF v_uid IS NOT NULL THEN
    v_source := 'direct_edit';
  ELSE
    v_source := 'system';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT p.name FROM public.profiles p WHERE p.user_id = v_uid OR p.id = v_uid ORDER BY (p.user_id = v_uid) DESC LIMIT 1),
      (SELECT e.name FROM public.employees e WHERE e.user_id = v_uid LIMIT 1),
      (SELECT p.email FROM public.profiles p WHERE p.user_id = v_uid OR p.id = v_uid ORDER BY (p.user_id = v_uid) DESC LIMIT 1)
    ) INTO v_name;
  END IF;

  IF NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id THEN
    INSERT INTO public.attribution_field_audit(order_id, field_name, old_value, new_value, actor_id, actor_name, source_path, db_session_user)
    VALUES (NEW.id, 'sales_person_id', OLD.sales_person_id::text, NEW.sales_person_id::text, v_uid, v_name, v_source, v_session_user);
  END IF;
  IF NEW.attributed_by IS DISTINCT FROM OLD.attributed_by THEN
    INSERT INTO public.attribution_field_audit(order_id, field_name, old_value, new_value, actor_id, actor_name, source_path, db_session_user)
    VALUES (NEW.id, 'attributed_by', OLD.attributed_by::text, NEW.attributed_by::text, v_uid, v_name, v_source, v_session_user);
  END IF;
  IF NEW.attributed_at IS DISTINCT FROM OLD.attributed_at THEN
    INSERT INTO public.attribution_field_audit(order_id, field_name, old_value, new_value, actor_id, actor_name, source_path, db_session_user)
    VALUES (NEW.id, 'attributed_at', OLD.attributed_at::text, NEW.attributed_at::text, v_uid, v_name, v_source, v_session_user);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_website_order_sales_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flag text;
  v_uid uuid;
  v_name text;
  v_log_needed boolean := false;
  v_from_id uuid;
BEGIN
  IF NEW.external_id IS NULL OR OLD.source <> 'website' THEN
    RETURN NEW;
  END IF;

  IF NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
     OR NEW.sales_person_name IS DISTINCT FROM OLD.sales_person_name THEN
    BEGIN v_flag := current_setting('app.attribution_rpc', true); EXCEPTION WHEN OTHERS THEN v_flag := NULL; END;
    IF v_flag = 'on' THEN
      RETURN NEW;
    END IF;

    IF pg_trigger_depth() = 1
       AND NEW.sales_person_id IS NOT NULL
       AND NEW.sales_person_id <> 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid THEN
      PERFORM set_config('app.attribution_source', 'trigger_normalize', true);
      NEW.source := 'manual';
      NEW.lead_source := COALESCE(NEW.lead_source, 'website');
      NEW.sales_attribution_locked := true;
      IF NEW.attributed_at IS NULL THEN NEW.attributed_at := now(); END IF;
      v_uid := auth.uid();
      IF v_uid IS NOT NULL THEN
        IF NEW.attributed_by IS NULL THEN NEW.attributed_by := v_uid; END IF;
        IF NEW.attributed_by_name IS NULL THEN
          SELECT COALESCE(
            (SELECT p.name FROM public.profiles p WHERE p.user_id = v_uid OR p.id = v_uid ORDER BY (p.user_id = v_uid) DESC LIMIT 1),
            (SELECT e.name FROM public.employees e WHERE e.user_id = v_uid LIMIT 1),
            (SELECT p.email FROM public.profiles p WHERE p.user_id = v_uid OR p.id = v_uid ORDER BY (p.user_id = v_uid) DESC LIMIT 1)
          ) INTO v_name;
          NEW.attributed_by_name := v_name;
        END IF;
      END IF;
      IF NEW.sales_attribution_reason IS NULL THEN NEW.sales_attribution_reason := 'direct_admin_edit'; END IF;
      v_log_needed := true;
      v_from_id := OLD.sales_person_id;
    END IF;
  END IF;

  IF v_log_needed THEN
    INSERT INTO public.sales_attribution_log (
      order_id, from_sales_person_id, to_sales_person_id, to_sales_person_name,
      reason, reason_custom, changed_by, changed_by_name, source
    ) VALUES (
      NEW.id, v_from_id, NEW.sales_person_id, NEW.sales_person_name,
      COALESCE(NEW.sales_attribution_reason, 'direct_admin_edit'),
      NEW.sales_attribution_reason_custom,
      NEW.attributed_by, NEW.attributed_by_name,
      'direct'
    );
  END IF;

  RETURN NEW;
END;
$function$;