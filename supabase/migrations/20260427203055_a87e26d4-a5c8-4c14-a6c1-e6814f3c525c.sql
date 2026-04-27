ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_temperature text NOT NULL DEFAULT 'warm';

CREATE INDEX IF NOT EXISTS idx_call_logs_assigned_to ON public.call_logs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_source ON public.call_logs(lead_source);

CREATE OR REPLACE FUNCTION public.assign_call_log_round_robin()
RETURNS trigger
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

DROP TRIGGER IF EXISTS trg_call_logs_round_robin ON public.call_logs;
CREATE TRIGGER trg_call_logs_round_robin
BEFORE INSERT ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.assign_call_log_round_robin();

DO $$
DECLARE
  r record;
  v_pool uuid[];
  v_pool_names text[];
  v_idx int := 0;
  v_len int;
BEGIN
  SELECT array_agg(p.user_id ORDER BY p.user_id),
         array_agg(p.name ORDER BY p.user_id)
    INTO v_pool, v_pool_names
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.is_approved = true
    AND ur.role IN ('sales', 'sales_manager');

  v_len := COALESCE(array_length(v_pool, 1), 0);
  IF v_len = 0 THEN RETURN; END IF;

  FOR r IN
    SELECT id FROM public.call_logs
    WHERE lead_source = 'ElevenLabs' AND assigned_to IS NULL
    ORDER BY created_at
  LOOP
    UPDATE public.call_logs
       SET assigned_to = v_pool[(v_idx % v_len) + 1],
           assigned_to_name = v_pool_names[(v_idx % v_len) + 1]
     WHERE id = r.id;
    v_idx := v_idx + 1;
  END LOOP;
END $$;