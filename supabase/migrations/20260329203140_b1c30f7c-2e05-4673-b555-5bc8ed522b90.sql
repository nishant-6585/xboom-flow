
-- Add sales_person_id and sales_person_name to call_logs for auto-assignment
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS sales_person_id UUID;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS sales_person_name TEXT;

-- Create function to auto-assign salesperson based on answering agent
CREATE OR REPLACE FUNCTION public.auto_assign_salesperson_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_name TEXT;
  v_matched_user RECORD;
  v_legs JSONB;
  v_leg JSONB;
  v_rr JSONB;
BEGIN
  -- Only process if sales_person_id is not already set
  IF NEW.sales_person_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to extract the answering agent from raw_payload
  v_agent_name := NULL;
  
  IF NEW.raw_payload IS NOT NULL AND jsonb_typeof(NEW.raw_payload::jsonb -> '_ld') = 'array' THEN
    FOR v_leg IN SELECT * FROM jsonb_array_elements(NEW.raw_payload::jsonb -> '_ld')
    LOOP
      IF v_leg ->> '_ac' = 'received' AND jsonb_typeof(v_leg -> '_rr') = 'array' THEN
        FOR v_rr IN SELECT * FROM jsonb_array_elements(v_leg -> '_rr')
        LOOP
          IF v_rr ->> '_na' IS NOT NULL AND v_rr ->> '_na' != '' THEN
            v_agent_name := v_rr ->> '_na';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Fallback to assigned_agent_name or agent_name
  IF v_agent_name IS NULL THEN
    v_agent_name := COALESCE(NEW.assigned_agent_name, NEW.agent_name);
  END IF;

  IF v_agent_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Match agent name to a sales profile (case-insensitive partial match)
  SELECT p.user_id, p.name INTO v_matched_user
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role = 'sales'
    AND p.is_approved = true
    AND (
      LOWER(p.name) = LOWER(v_agent_name)
      OR LOWER(p.name) LIKE '%' || LOWER(v_agent_name) || '%'
      OR LOWER(v_agent_name) LIKE '%' || LOWER(p.name) || '%'
    )
  LIMIT 1;

  IF v_matched_user IS NOT NULL THEN
    NEW.sales_person_id := v_matched_user.user_id;
    NEW.sales_person_name := v_matched_user.name;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for auto-assignment
DROP TRIGGER IF EXISTS trg_auto_assign_salesperson_call ON public.call_logs;
CREATE TRIGGER trg_auto_assign_salesperson_call
  BEFORE INSERT OR UPDATE ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_salesperson_on_call();
