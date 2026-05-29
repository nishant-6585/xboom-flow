
-- =====================================================================
-- 1) Fix auto_assign_salesperson (interakt/email/form/call BEFORE INSERT)
--    Use full website pool + availability filter; fall back to anyone if
--    everyone is out.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.auto_assign_salesperson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counter INTEGER;
  v_idx     INTEGER;
  v_pool    RECORD;
  v_ids     UUID[];
  v_names   TEXT[];
  v_size    INT;
BEGIN
  -- Honour any caller-supplied assignment.
  IF NEW.sales_person_id IS NOT NULL AND NEW.sales_person_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Build available pool from the canonical allow-list.
  SELECT
    array_agg(a.uid  ORDER BY a.uid),
    array_agg(a.uname ORDER BY a.uid)
  INTO v_ids, v_names
  FROM public.allowed_website_lead_assignees() a
  WHERE public.is_user_available_on(a.uid, CURRENT_DATE);

  v_size := COALESCE(array_length(v_ids, 1), 0);

  -- Hard fallback: everyone unavailable → use full allow-list.
  IF v_size = 0 THEN
    SELECT
      array_agg(a.uid  ORDER BY a.uid),
      array_agg(a.uname ORDER BY a.uid)
    INTO v_ids, v_names
    FROM public.allowed_website_lead_assignees() a;
    v_size := COALESCE(array_length(v_ids, 1), 0);
  END IF;

  IF v_size = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.lead_assignment_counter
     SET counter = counter + 1
   WHERE id = 1
   RETURNING counter INTO v_counter;

  IF v_counter IS NULL THEN
    INSERT INTO public.lead_assignment_counter (id, counter)
    VALUES (1, 1)
    ON CONFLICT (id) DO UPDATE SET counter = public.lead_assignment_counter.counter + 1
    RETURNING counter INTO v_counter;
  END IF;

  v_idx := ((v_counter - 1) % v_size) + 1;

  NEW.sales_person_id   := v_ids[v_idx];
  NEW.sales_person_name := v_names[v_idx];

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- 2) Fix assign_call_log_round_robin to skip unavailable salespeople
-- =====================================================================
CREATE OR REPLACE FUNCTION public.assign_call_log_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next_user_id uuid;
  v_next_name    text;
  v_last_assignee uuid;
BEGIN
  IF NEW.assigned_to IS NULL AND NEW.lead_source = 'ElevenLabs' THEN
    SELECT assigned_to INTO v_last_assignee
    FROM public.call_logs
    WHERE assigned_to IS NOT NULL AND lead_source = 'ElevenLabs'
    ORDER BY created_at DESC LIMIT 1;

    -- Available pool first
    SELECT p.user_id, p.name
      INTO v_next_user_id, v_next_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
      AND public.is_user_available_on(p.user_id, CURRENT_DATE)
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
        AND public.is_user_available_on(p.user_id, CURRENT_DATE)
      GROUP BY p.user_id, p.name
      ORDER BY p.user_id
      LIMIT 1;
    END IF;

    -- Hard fallback: ignore availability if everyone is out
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

-- =====================================================================
-- 3) Fix auto_assign_form_lead (Contact-Us routing) to skip unavailable
-- =====================================================================
CREATE OR REPLACE FUNCTION public.auto_assign_form_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _assignees text[];
  _user_ids  uuid[];
  _avail_ids uuid[];
  _avail_nms text[];
  _idx       integer;
  _counter   integer;
  _size      integer;
  i          integer;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.form_name ILIKE '%contact%us%' THEN
    _user_ids := ARRAY[
      'e05f9afe-0160-4956-bb1f-496028386062'::uuid, -- Arjav
      '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, -- Suman Das
      'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid  -- Narasimha
    ];
    _assignees := ARRAY['Arjav chauhan', 'suman das', 'Narasimha'];

    -- Filter to available people in this 3-person list
    _avail_ids := ARRAY[]::uuid[];
    _avail_nms := ARRAY[]::text[];
    FOR i IN 1 .. array_length(_user_ids, 1) LOOP
      IF public.is_user_available_on(_user_ids[i], CURRENT_DATE) THEN
        _avail_ids := _avail_ids || _user_ids[i];
        _avail_nms := _avail_nms || _assignees[i];
      END IF;
    END LOOP;

    -- If none of the three are available, fall back to the full website pool.
    IF COALESCE(array_length(_avail_ids, 1), 0) = 0 THEN
      SELECT
        array_agg(a.uid  ORDER BY a.uid),
        array_agg(a.uname ORDER BY a.uid)
      INTO _avail_ids, _avail_nms
      FROM public.allowed_website_lead_assignees() a
      WHERE public.is_user_available_on(a.uid, CURRENT_DATE);
    END IF;

    -- If still nobody, fall back to the original 3.
    IF COALESCE(array_length(_avail_ids, 1), 0) = 0 THEN
      _avail_ids := _user_ids;
      _avail_nms := _assignees;
    END IF;

    _size := array_length(_avail_ids, 1);

    UPDATE form_lead_contact_us_counter
       SET counter = counter + 1
     WHERE id = 1
     RETURNING counter INTO _counter;

    _idx := ((_counter - 1) % _size) + 1;
    NEW.assigned_to      := _avail_ids[_idx];
    NEW.assigned_to_name := _avail_nms[_idx];

  ELSIF NEW.form_name ILIKE '%resell%' OR NEW.form_name ILIKE '%sell%used%' OR NEW.form_name ILIKE '%rental%' OR NEW.form_name ILIKE '%repair%' OR NEW.form_name ILIKE '%ready%for%rental%' OR NEW.form_name ILIKE '%bulk%order%' THEN
    NEW.assigned_to := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
    NEW.assigned_to_name := 'Rohit';

  ELSIF NEW.form_name ILIKE '%pilot%training%' OR NEW.form_name ILIKE '%training%pilot%' OR NEW.form_name ILIKE '%drone%pilot%' THEN
    NEW.assigned_to := 'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid;
    NEW.assigned_to_name := 'Narasimha';

  ELSIF NEW.form_name ILIKE '%drone%show%' THEN
    NEW.assigned_to := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
    NEW.assigned_to_name := 'Rohit';
  END IF;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- 4) Fix enforce_woo_website_lead_assignment to skip unavailable
-- =====================================================================
CREATE OR REPLACE FUNCTION public.enforce_woo_website_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pool uuid[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid, -- Arjav
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, -- Narasimha
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, -- Mohammed Musthak
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, -- Suman Das
    '74930912-193a-4081-a87f-46902ee96c4d'::uuid, -- Srishti
    '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid  -- Manoj
  ];
  v_available uuid[];
  v_pick uuid;
  v_name text;
BEGIN
  SELECT array_agg(u)
    INTO v_available
    FROM unnest(v_pool) AS u
   WHERE public.is_user_available_on(u, CURRENT_DATE);

  IF v_available IS NULL OR array_length(v_available, 1) = 0 THEN
    v_available := v_pool;
  END IF;

  SELECT u
  INTO v_pick
  FROM unnest(v_available) AS u
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS c
    FROM public.woocommerce_orders
    WHERE assigned_to = ANY(v_available)
    GROUP BY assigned_to
  ) t ON t.assigned_to = u
  ORDER BY COALESCE(t.c, 0) ASC, random()
  LIMIT 1;

  SELECT name INTO v_name FROM public.profiles WHERE user_id = v_pick;

  NEW.assigned_to := v_pick;
  NEW.assigned_to_name := v_name;
  NEW.assigned_at := now();
  RETURN NEW;
END;
$function$;

-- =====================================================================
-- 5) Reassign already-misassigned leads created during unavailability
--    windows to currently available salespeople, evenly distributed.
-- =====================================================================
DO $$
DECLARE
  v_avail_ids   uuid[];
  v_avail_names text[];
  v_size        int;
  r             record;
  v_pick_id     uuid;
  v_pick_name   text;
  v_i           int;
BEGIN
  -- Currently available pool (today)
  SELECT
    array_agg(a.uid  ORDER BY a.uid),
    array_agg(a.uname ORDER BY a.uid)
  INTO v_avail_ids, v_avail_names
  FROM public.allowed_website_lead_assignees() a
  WHERE public.is_user_available_on(a.uid, CURRENT_DATE);

  v_size := COALESCE(array_length(v_avail_ids, 1), 0);
  IF v_size = 0 THEN
    RAISE NOTICE 'No available salespeople; skipping reassignment';
    RETURN;
  END IF;

  v_i := 0;

  -- ---- interakt_leads (sales_person_id is text) ----
  FOR r IN
    SELECT il.id
      FROM public.interakt_leads il
      JOIN (VALUES
        ('457fc2d5-9fc5-439a-938e-5b998549b811','2026-05-27'::date,'2026-05-30'::date),
        ('e05f9afe-0160-4956-bb1f-496028386062','2026-05-27'::date,'2026-06-03'::date)
      ) AS u(uid,s,e)
        ON il.sales_person_id = u.uid
       AND il.created_at::date BETWEEN u.s AND u.e
     ORDER BY il.created_at, il.id
  LOOP
    v_i := v_i + 1;
    v_pick_id   := v_avail_ids[((v_i - 1) % v_size) + 1];
    v_pick_name := v_avail_names[((v_i - 1) % v_size) + 1];
    UPDATE public.interakt_leads
       SET sales_person_id   = v_pick_id::text,
           sales_person_name = v_pick_name
     WHERE id = r.id;
  END LOOP;

  -- ---- call_logs ----
  FOR r IN
    SELECT cl.id
      FROM public.call_logs cl
      JOIN (VALUES
        ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'2026-05-27'::date,'2026-05-30'::date),
        ('e05f9afe-0160-4956-bb1f-496028386062'::uuid,'2026-05-27'::date,'2026-06-03'::date)
      ) AS u(uid,s,e)
        ON cl.sales_person_id = u.uid
       AND cl.created_at::date BETWEEN u.s AND u.e
     ORDER BY cl.created_at, cl.id
  LOOP
    v_i := v_i + 1;
    v_pick_id   := v_avail_ids[((v_i - 1) % v_size) + 1];
    v_pick_name := v_avail_names[((v_i - 1) % v_size) + 1];
    UPDATE public.call_logs
       SET sales_person_id   = v_pick_id,
           sales_person_name = v_pick_name,
           assigned_to       = v_pick_id,
           assigned_to_name  = v_pick_name
     WHERE id = r.id;
  END LOOP;

  -- ---- email_leads ----
  FOR r IN
    SELECT el.id
      FROM public.email_leads el
      JOIN (VALUES
        ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'2026-05-27'::date,'2026-05-30'::date),
        ('e05f9afe-0160-4956-bb1f-496028386062'::uuid,'2026-05-27'::date,'2026-06-03'::date)
      ) AS u(uid,s,e)
        ON el.sales_person_id = u.uid
       AND el.created_at::date BETWEEN u.s AND u.e
     ORDER BY el.created_at, el.id
  LOOP
    v_i := v_i + 1;
    v_pick_id   := v_avail_ids[((v_i - 1) % v_size) + 1];
    v_pick_name := v_avail_names[((v_i - 1) % v_size) + 1];
    UPDATE public.email_leads
       SET sales_person_id   = v_pick_id,
           sales_person_name = v_pick_name
     WHERE id = r.id;
  END LOOP;

  -- ---- leads (website/QForm) ----
  FOR r IN
    SELECT l.id
      FROM public.leads l
      JOIN (VALUES
        ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'2026-05-27'::date,'2026-05-30'::date),
        ('e05f9afe-0160-4956-bb1f-496028386062'::uuid,'2026-05-27'::date,'2026-06-03'::date)
      ) AS u(uid,s,e)
        ON l.assigned_to = u.uid
       AND l.created_at::date BETWEEN u.s AND u.e
     ORDER BY l.created_at, l.id
  LOOP
    v_i := v_i + 1;
    v_pick_id   := v_avail_ids[((v_i - 1) % v_size) + 1];
    v_pick_name := v_avail_names[((v_i - 1) % v_size) + 1];
    UPDATE public.leads
       SET assigned_to      = v_pick_id,
           assigned_to_name = v_pick_name
     WHERE id = r.id;
  END LOOP;

  -- ---- woocommerce_orders ----
  FOR r IN
    SELECT w.id
      FROM public.woocommerce_orders w
      JOIN (VALUES
        ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'2026-05-27'::date,'2026-05-30'::date),
        ('e05f9afe-0160-4956-bb1f-496028386062'::uuid,'2026-05-27'::date,'2026-06-03'::date)
      ) AS u(uid,s,e)
        ON w.assigned_to = u.uid
       AND w.created_at::date BETWEEN u.s AND u.e
     ORDER BY w.created_at, w.id
  LOOP
    v_i := v_i + 1;
    v_pick_id   := v_avail_ids[((v_i - 1) % v_size) + 1];
    v_pick_name := v_avail_names[((v_i - 1) % v_size) + 1];
    UPDATE public.woocommerce_orders
       SET assigned_to      = v_pick_id,
           assigned_to_name = v_pick_name,
           assigned_at      = now()
     WHERE id = r.id;
  END LOOP;
END $$;
