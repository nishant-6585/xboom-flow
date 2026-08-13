-- Align ManyChat lead assignment with the MyOperator call-log rep pool:
-- only suman das / Narasimha / mohammed musthak / Srishti / Manoj Kumar.
-- 1. Round-robin trigger draws from that fixed pool.
-- 2. Existing leads assigned outside the pool (or unassigned) are
--    redistributed round-robin across it.

CREATE OR REPLACE FUNCTION public.assign_manychat_lead_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next_user_id uuid;
  v_next_name text;
  v_last_assignee uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT assigned_to INTO v_last_assignee
  FROM public.manychat_leads
  WHERE assigned_to IS NOT NULL
  ORDER BY created_at DESC LIMIT 1;

  WITH pool AS (
    SELECT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') ~* '(suman das|narasimha|musthak|srishti|manoj kumar)'
      AND public.is_user_available_on(p.user_id, CURRENT_DATE)
    GROUP BY p.user_id, p.name
  )
  SELECT user_id, name INTO v_next_user_id, v_next_name
  FROM pool
  WHERE v_last_assignee IS NULL OR user_id > v_last_assignee
  ORDER BY user_id LIMIT 1;

  IF v_next_user_id IS NULL THEN
    WITH pool AS (
      SELECT p.user_id, p.name
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.is_approved = true
        AND ur.role IN ('sales', 'sales_manager')
        AND COALESCE(p.name, '') ~* '(suman das|narasimha|musthak|srishti|manoj kumar)'
      GROUP BY p.user_id, p.name
    )
    SELECT user_id, name INTO v_next_user_id, v_next_name
    FROM pool ORDER BY user_id LIMIT 1;
  END IF;

  IF v_next_user_id IS NOT NULL THEN
    NEW.assigned_to := v_next_user_id;
    NEW.assigned_to_name := v_next_name;
  END IF;

  RETURN NEW;
END;
$$;

-- Redistribute existing ManyChat leads that are unassigned or assigned to
-- someone outside the fixed pool.
DO $$
DECLARE
  pool_ids uuid[];
  pool_names text[];
  n int;
  i int := 0;
  lead RECORD;
BEGIN
  SELECT array_agg(user_id ORDER BY user_id), array_agg(name ORDER BY user_id)
    INTO pool_ids, pool_names
  FROM (
    SELECT DISTINCT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
      AND COALESCE(p.name, '') ~* '(suman das|narasimha|musthak|srishti|manoj kumar)'
  ) t;

  n := COALESCE(array_length(pool_ids, 1), 0);
  IF n = 0 THEN
    RAISE NOTICE 'manychat assign pool empty — skipping reassignment';
    RETURN;
  END IF;

  FOR lead IN
    SELECT id FROM public.manychat_leads
    WHERE assigned_to IS NULL OR NOT (assigned_to = ANY (pool_ids))
    ORDER BY created_at
  LOOP
    i := i + 1;
    UPDATE public.manychat_leads
      SET assigned_to = pool_ids[((i - 1) % n) + 1],
          assigned_to_name = pool_names[((i - 1) % n) + 1]
    WHERE id = lead.id;
  END LOOP;

  RAISE NOTICE 'reassigned % manychat leads across % reps', i, n;
END $$;
