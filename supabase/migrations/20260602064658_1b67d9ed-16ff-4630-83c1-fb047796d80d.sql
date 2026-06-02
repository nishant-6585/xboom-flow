CREATE OR REPLACE FUNCTION public.auto_assign_salesperson_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent_name TEXT;
  v_agent_phone TEXT;
  v_matched_user RECORD;
  v_leg JSONB;
  v_rr JSONB;
  v_payload JSONB;
  v_legs JSONB;
  v_resolved UUID;
  v_pool UUID[] := ARRAY[
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid,
    '74930912-193a-4081-a87f-46902ee96c4d'::uuid,
    '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid
  ];
  v_last_assignee UUID;
  v_last_idx INT;
  v_next_idx INT;
  v_next_user UUID;
BEGIN
  IF NEW.sales_person_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.raw_payload IS NOT NULL THEN
    BEGIN
      v_payload := NEW.raw_payload::jsonb;
    EXCEPTION WHEN others THEN
      v_payload := NULL;
    END;
  END IF;

  IF v_payload IS NOT NULL THEN
    IF jsonb_typeof(v_payload -> 'log_details') = 'array' THEN
      v_legs := v_payload -> 'log_details';
    ELSIF jsonb_typeof(v_payload -> '_ld') = 'array' THEN
      v_legs := v_payload -> '_ld';
    END IF;
  END IF;

  IF v_legs IS NOT NULL THEN
    FOR v_leg IN SELECT * FROM jsonb_array_elements(v_legs)
    LOOP
      IF (v_leg ->> 'action') = 'received' OR (v_leg ->> '_ac') = 'received' THEN
        IF jsonb_typeof(v_leg -> 'received_by') = 'array' THEN
          FOR v_rr IN SELECT * FROM jsonb_array_elements(v_leg -> 'received_by')
          LOOP
            IF (v_rr ->> 'name') IS NOT NULL AND (v_rr ->> 'name') <> '' THEN
              v_agent_name := v_rr ->> 'name';
              v_agent_phone := COALESCE(v_agent_phone, v_rr ->> 'contact_number');
            END IF;
          END LOOP;
        ELSIF jsonb_typeof(v_leg -> '_rr') = 'array' THEN
          FOR v_rr IN SELECT * FROM jsonb_array_elements(v_leg -> '_rr')
          LOOP
            IF (v_rr ->> '_na') IS NOT NULL AND (v_rr ->> '_na') <> '' THEN
              v_agent_name := v_rr ->> '_na';
              v_agent_phone := COALESCE(v_agent_phone, v_rr ->> '_ct');
            END IF;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF v_agent_phone IS NULL THEN
    v_agent_phone := NEW.assigned_agent_phone;
  END IF;

  IF v_agent_phone IS NOT NULL THEN
    BEGIN
      v_resolved := public.resolve_agent_user('myoperator'::text, NULL::text, v_agent_phone);
    EXCEPTION WHEN others THEN
      v_resolved := NULL;
    END;
    IF v_resolved IS NOT NULL THEN
      SELECT user_id, name INTO v_matched_user FROM public.profiles WHERE user_id = v_resolved LIMIT 1;
      IF FOUND THEN
        NEW.sales_person_id := v_matched_user.user_id;
        NEW.sales_person_name := v_matched_user.name;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF v_agent_name IS NULL THEN
    v_agent_name := COALESCE(NEW.assigned_agent_name, NEW.agent_name);
  END IF;

  IF v_agent_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_agent_name := trim(split_part(v_agent_name, ',', 1));

  -- AI bot "Artificial" answered the call -> round-robin across sales pool.
  IF LOWER(v_agent_name) = 'artificial' THEN
    SELECT sales_person_id INTO v_last_assignee
    FROM public.call_logs
    WHERE sales_person_id = ANY(v_pool)
      AND (assigned_agent_name ILIKE '%rtificial%' OR agent_name ILIKE '%rtificial%')
    ORDER BY created_at DESC
    LIMIT 1;

    v_next_idx := 0;
    IF v_last_assignee IS NOT NULL THEN
      v_last_idx := array_position(v_pool, v_last_assignee);
      IF v_last_idx IS NOT NULL THEN
        v_next_idx := v_last_idx % array_length(v_pool, 1);
      END IF;
    END IF;

    v_next_user := v_pool[v_next_idx + 1];
    SELECT user_id, name INTO v_matched_user FROM public.profiles WHERE user_id = v_next_user LIMIT 1;
    IF FOUND THEN
      NEW.sales_person_id := v_matched_user.user_id;
      NEW.sales_person_name := v_matched_user.name;
    END IF;
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.name INTO v_matched_user
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'sales'
    AND p.is_approved = true
    AND (
      LOWER(p.name) = LOWER(v_agent_name)
      OR LOWER(p.name) LIKE LOWER(v_agent_name) || '%'
      OR LOWER(v_agent_name) LIKE LOWER(split_part(p.name, ' ', 1)) || '%'
      OR LOWER(split_part(p.name, ' ', 1)) LIKE LOWER(v_agent_name) || '%'
      OR regexp_replace(LOWER(p.name), '[aeiou]', '', 'g')
         = regexp_replace(LOWER(v_agent_name), '[aeiou]', '', 'g')
    )
  ORDER BY
    CASE WHEN LOWER(p.name) = LOWER(v_agent_name) THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_matched_user IS NOT NULL THEN
    NEW.sales_person_id := v_matched_user.user_id;
    NEW.sales_person_name := v_matched_user.name;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: round-robin assign recent AI-answered calls that have no sales rep.
DO $$
DECLARE
  v_pool UUID[] := ARRAY[
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid,
    '74930912-193a-4081-a87f-46902ee96c4d'::uuid,
    '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid
  ];
  r RECORD;
  v_idx INT := 0;
  v_user UUID;
  v_name TEXT;
BEGIN
  FOR r IN
    SELECT id
    FROM public.call_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND sales_person_id IS NULL
      AND (
        assigned_agent_name ILIKE '%rtificial%'
        OR agent_name ILIKE '%rtificial%'
      )
    ORDER BY created_at ASC
  LOOP
    v_user := v_pool[(v_idx % array_length(v_pool, 1)) + 1];
    SELECT name INTO v_name FROM public.profiles WHERE user_id = v_user;
    UPDATE public.call_logs
      SET sales_person_id = v_user,
          sales_person_name = v_name
      WHERE id = r.id;
    v_idx := v_idx + 1;
  END LOOP;
END $$;