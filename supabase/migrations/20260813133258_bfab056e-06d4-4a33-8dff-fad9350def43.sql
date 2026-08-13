CREATE OR REPLACE FUNCTION public.enforce_website_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_idx INT;
  v_uid UUID;
  v_name TEXT;
  v_rohit_id UUID := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
  v_pool_size INT;
  v_using_fallback BOOLEAN := FALSE;
  v_form_type TEXT;
BEGIN
  -- form_type only exists on some lead tables; read it defensively.
  v_form_type := to_jsonb(NEW) ->> 'form_type';

  -- Drone-repair-intake: Rohit if available, else fall through to the regular pool
  IF v_form_type = 'drone-repair-intake' THEN
    IF public.is_user_available_on(v_rohit_id) THEN
      NEW.assigned_to := v_rohit_id;
      SELECT name INTO v_name FROM public.profiles WHERE user_id = v_rohit_id;
      NEW.assigned_to_name := COALESCE(v_name, 'Rohit');
      RETURN NEW;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_pool_size FROM public.available_website_lead_assignees();
  IF v_pool_size = 0 THEN
    SELECT COUNT(*) INTO v_pool_size FROM public.allowed_website_lead_assignees();
    v_using_fallback := TRUE;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    SELECT uname INTO v_name FROM public.allowed_website_lead_assignees() WHERE uid = NEW.assigned_to;
    IF v_name IS NOT NULL AND public.is_user_available_on(NEW.assigned_to) THEN
      NEW.assigned_to_name := v_name;
      RETURN NEW;
    END IF;
  END IF;

  IF COALESCE(v_pool_size, 0) = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.lead_assignment_state
  SET next_index = (next_index + 1) % v_pool_size
  WHERE id = 1
  RETURNING ((next_index + v_pool_size - 1) % v_pool_size) INTO v_idx;

  IF v_idx IS NULL THEN
    INSERT INTO public.lead_assignment_state (id, next_index) VALUES (1, 1)
    ON CONFLICT (id) DO UPDATE SET next_index = (public.lead_assignment_state.next_index + 1) % v_pool_size;
    v_idx := 0;
  END IF;

  IF v_using_fallback THEN
    SELECT uid, uname INTO v_uid, v_name
    FROM public.allowed_website_lead_assignees() OFFSET v_idx LIMIT 1;
  ELSE
    SELECT uid, uname INTO v_uid, v_name
    FROM public.available_website_lead_assignees() OFFSET v_idx LIMIT 1;
  END IF;

  NEW.assigned_to := v_uid;
  NEW.assigned_to_name := v_name;

  IF v_using_fallback AND TG_TABLE_NAME = 'leads' THEN
    NEW.message := COALESCE(NEW.message, '') ||
      E'\n[Auto-assigned via fallback — entire sales pool marked unavailable on ' ||
      to_char(now(), 'YYYY-MM-DD HH24:MI') || ']';
  END IF;

  RETURN NEW;
END;
$function$;