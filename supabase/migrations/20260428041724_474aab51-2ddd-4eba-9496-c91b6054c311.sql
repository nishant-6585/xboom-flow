
CREATE OR REPLACE FUNCTION public.assign_call_log_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_assignee uuid;
  v_next_user_id uuid;
  v_next_name text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.lead_source, '') <> 'ElevenLabs' THEN
    RETURN NEW;
  END IF;

  SELECT assigned_to INTO v_last_assignee
  FROM public.call_logs
  WHERE assigned_to IS NOT NULL AND lead_source = 'ElevenLabs'
  ORDER BY created_at DESC
  LIMIT 1;

  WITH pool AS (
    SELECT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar)'
    GROUP BY p.user_id, p.name
    ORDER BY p.user_id
  )
  SELECT user_id, name INTO v_next_user_id, v_next_name
  FROM pool
  WHERE v_last_assignee IS NULL OR user_id > v_last_assignee
  ORDER BY user_id
  LIMIT 1;

  IF v_next_user_id IS NULL THEN
    SELECT p.user_id, p.name INTO v_next_user_id, v_next_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar)'
    GROUP BY p.user_id, p.name
    ORDER BY p.user_id
    LIMIT 1;
  END IF;

  IF v_next_user_id IS NOT NULL THEN
    NEW.assigned_to := v_next_user_id;
    NEW.assigned_to_name := v_next_name;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_lead_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_assignee uuid;
  v_next_user_id uuid;
  v_next_name text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT assigned_to INTO v_last_assignee
  FROM public.leads
  WHERE assigned_to IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  WITH pool AS (
    SELECT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar)'
    GROUP BY p.user_id, p.name
    ORDER BY p.user_id
  )
  SELECT user_id, name
  INTO v_next_user_id, v_next_name
  FROM pool
  WHERE v_last_assignee IS NULL OR user_id > v_last_assignee
  ORDER BY user_id
  LIMIT 1;

  IF v_next_user_id IS NULL THEN
    SELECT p.user_id, p.name INTO v_next_user_id, v_next_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar)'
    GROUP BY p.user_id, p.name
    ORDER BY p.user_id
    LIMIT 1;
  END IF;

  IF v_next_user_id IS NOT NULL THEN
    NEW.assigned_to := v_next_user_id;
    NEW.assigned_to_name := v_next_name;
  END IF;

  RETURN NEW;
END;
$function$;
