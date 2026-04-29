CREATE OR REPLACE FUNCTION public.assign_call_log_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next_user_id uuid;
  v_next_name text;
  v_last_assignee uuid;
BEGIN
  IF NEW.assigned_to IS NULL AND NEW.lead_source = 'ElevenLabs' THEN
    SELECT assigned_to INTO v_last_assignee
    FROM public.call_logs
    WHERE assigned_to IS NOT NULL AND lead_source = 'ElevenLabs'
    ORDER BY created_at DESC LIMIT 1;

    SELECT p.user_id, p.name
      INTO v_next_user_id, v_next_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
      AND (v_last_assignee IS NULL OR p.user_id > v_last_assignee)
    GROUP BY p.user_id, p.name
    ORDER BY p.user_id
    LIMIT 1;

    IF v_next_user_id IS NULL THEN
      SELECT p.user_id, p.name
        INTO v_next_user_id, v_next_name
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.is_approved = true
        AND ur.role IN ('sales', 'sales_manager')
        AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
      GROUP BY p.user_id, p.name
      ORDER BY p.user_id
      LIMIT 1;
    END IF;

    IF v_next_user_id IS NOT NULL THEN
      NEW.assigned_to := v_next_user_id;
      NEW.assigned_to_name := v_next_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;