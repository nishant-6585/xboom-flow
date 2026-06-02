-- 1. Seed agent_user_mapping for MyOperator agents (idempotent upsert via ON CONFLICT)
INSERT INTO public.agent_user_mapping (provider, agent_phone, user_id, notes)
VALUES
  ('myoperator', '+919008296239', 'a790b58d-8e3d-4333-b6d6-08be631c865d', 'Narsimha (MyOp) -> Narasimha'),
  ('myoperator', '+919019916638', '457fc2d5-9fc5-439a-938e-5b998549b811', 'Mushtaq (MyOp) -> mohammed musthak'),
  ('myoperator', '+918310167438', 'e05f9afe-0160-4956-bb1f-496028386062', 'Arjav (MyOp) -> Arjav chauhan'),
  ('myoperator', '+918310167411', '456e91f8-34cc-4f92-a1c1-a092f2bbed39', 'Suman (MyOp) -> suman das')
ON CONFLICT (provider, agent_phone) WHERE agent_phone IS NOT NULL
DO UPDATE SET user_id = EXCLUDED.user_id, notes = EXCLUDED.notes, is_active = true, updated_at = now();

-- 2. Replace assignment trigger to consult agent_user_mapping by phone first,
--    supporting both webhook (_ld/_rr/_ct) and sync (log_details/received_by/contact_number) payload shapes.
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
BEGIN
  IF NEW.sales_person_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Normalize payload
  IF NEW.raw_payload IS NOT NULL THEN
    BEGIN
      v_payload := NEW.raw_payload::jsonb;
    EXCEPTION WHEN others THEN
      v_payload := NULL;
    END;
  END IF;

  -- Pick legs from either schema
  IF v_payload IS NOT NULL THEN
    IF jsonb_typeof(v_payload -> 'log_details') = 'array' THEN
      v_legs := v_payload -> 'log_details';
    ELSIF jsonb_typeof(v_payload -> '_ld') = 'array' THEN
      v_legs := v_payload -> '_ld';
    END IF;
  END IF;

  IF v_legs IS NOT NULL THEN
    -- Prefer the "received"/"answered" leg
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

  -- Fallback to columns populated by webhook/sync
  IF v_agent_phone IS NULL THEN
    v_agent_phone := NEW.assigned_agent_phone;
  END IF;

  -- 1) Resolve via centralized agent_user_mapping by phone
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

  -- 2) Name-based fallback with spelling tolerance (strip vowels for fuzzy compare)
  IF v_agent_name IS NULL THEN
    v_agent_name := COALESCE(NEW.assigned_agent_name, NEW.agent_name);
  END IF;

  IF v_agent_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Use only the first token (handles comma-joined display names like "Narsimha, Mushtaq, ...")
  v_agent_name := split_part(v_agent_name, ',', 1);
  v_agent_name := trim(v_agent_name);

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
      -- vowel-stripped match: "narasimha" vs "narsimha"
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

-- 3. Backfill: re-assign today's call_logs where assignment is wrong/missing for Narsimha-answered calls
UPDATE public.call_logs cl
SET sales_person_id = 'a790b58d-8e3d-4333-b6d6-08be631c865d',
    sales_person_name = 'Narasimha'
WHERE cl.created_at >= CURRENT_DATE
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(cl.raw_payload::jsonb -> 'log_details') leg,
         jsonb_array_elements(leg -> 'received_by') rb
    WHERE (leg ->> 'action') = 'received'
      AND (rb ->> 'contact_number') = '+919008296239'
  )
  AND (cl.sales_person_id IS DISTINCT FROM 'a790b58d-8e3d-4333-b6d6-08be631c865d');
