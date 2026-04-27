-- 1. Add columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_enquiry_converted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_temperature text NOT NULL DEFAULT 'warm';

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_is_enquiry_converted ON public.leads(is_enquiry_converted);

-- 2. Round-robin auto-assign trigger
CREATE OR REPLACE FUNCTION public.assign_lead_round_robin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_assignee uuid;
  v_next_user_id uuid;
  v_next_name text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find the most recent prior assignee in leads
  SELECT assigned_to INTO v_last_assignee
  FROM public.leads
  WHERE assigned_to IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Pick the next salesperson in alphabetical order of user_id, after the last one (wraps around)
  WITH pool AS (
    SELECT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
    GROUP BY p.user_id, p.name
    ORDER BY p.user_id
  )
  SELECT user_id, name
  INTO v_next_user_id, v_next_name
  FROM pool
  WHERE v_last_assignee IS NULL OR user_id > v_last_assignee
  ORDER BY user_id
  LIMIT 1;

  -- Wrap around
  IF v_next_user_id IS NULL THEN
    SELECT p.user_id, p.name
    INTO v_next_user_id, v_next_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
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
$$;

DROP TRIGGER IF EXISTS trg_leads_round_robin ON public.leads;
CREATE TRIGGER trg_leads_round_robin
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_lead_round_robin();

-- 3. One-time backfill: distribute existing unassigned leads round-robin
DO $$
DECLARE
  pool_ids uuid[];
  pool_names text[];
  pool_size int;
  rec RECORD;
  idx int := 0;
BEGIN
  SELECT array_agg(user_id ORDER BY user_id), array_agg(name ORDER BY user_id)
  INTO pool_ids, pool_names
  FROM (
    SELECT p.user_id, p.name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true
      AND ur.role IN ('sales', 'sales_manager')
    GROUP BY p.user_id, p.name
  ) t;

  pool_size := COALESCE(array_length(pool_ids, 1), 0);
  IF pool_size = 0 THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT id FROM public.leads
    WHERE assigned_to IS NULL
    ORDER BY created_at ASC
  LOOP
    UPDATE public.leads
       SET assigned_to = pool_ids[(idx % pool_size) + 1],
           assigned_to_name = pool_names[(idx % pool_size) + 1]
     WHERE id = rec.id;
    idx := idx + 1;
  END LOOP;
END $$;