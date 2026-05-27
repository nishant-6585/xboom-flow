-- 1. Enum + table for sales unavailability windows
DO $$ BEGIN
  CREATE TYPE public.unavailability_reason AS ENUM (
    'vacation', 'sick_leave', 'training', 'official_travel', 'personal', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sales_unavailability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at   DATE NOT NULL,
  ends_at     DATE NOT NULL,
  reason      public.unavailability_reason NOT NULL DEFAULT 'vacation',
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_unavailability_dates_valid CHECK (ends_at >= starts_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_unavailability TO authenticated;
GRANT ALL ON public.sales_unavailability TO service_role;

CREATE INDEX IF NOT EXISTS idx_sales_unavail_user_dates
  ON public.sales_unavailability(user_id, starts_at, ends_at)
  WHERE cancelled_at IS NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_sales_unavail_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_sales_unavail_touch ON public.sales_unavailability;
CREATE TRIGGER trg_sales_unavail_touch
  BEFORE UPDATE ON public.sales_unavailability
  FOR EACH ROW EXECUTE FUNCTION public.touch_sales_unavail_updated_at();

ALTER TABLE public.sales_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users view unavailability" ON public.sales_unavailability;
CREATE POLICY "Approved users view unavailability"
  ON public.sales_unavailability FOR SELECT TO authenticated
  USING (public.is_user_approved(auth.uid()));

DROP POLICY IF EXISTS "Admin and sales_manager manage unavailability" ON public.sales_unavailability;
CREATE POLICY "Admin and sales_manager manage unavailability"
  ON public.sales_unavailability FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'sales_manager')
  );

-- 2. Availability helper
CREATE OR REPLACE FUNCTION public.is_user_available_on(_user_id UUID, _on DATE DEFAULT CURRENT_DATE)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.sales_unavailability
    WHERE user_id = _user_id
      AND cancelled_at IS NULL
      AND _on BETWEEN starts_at AND ends_at
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_user_available_on(UUID, DATE) TO authenticated;

-- 3. Available subset of the website-lead round-robin pool
CREATE OR REPLACE FUNCTION public.available_website_lead_assignees()
RETURNS TABLE(uid UUID, uname TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.uid, a.uname
  FROM public.allowed_website_lead_assignees() a
  WHERE public.is_user_available_on(a.uid, CURRENT_DATE)
  ORDER BY a.uid;
$$;
GRANT EXECUTE ON FUNCTION public.available_website_lead_assignees() TO authenticated;

-- 4. Update enforce_website_lead_assignment to skip unavailable users
CREATE OR REPLACE FUNCTION public.enforce_website_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_idx INT;
  v_uid UUID;
  v_name TEXT;
  v_rohit_id UUID := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
  v_pool_size INT;
  v_using_fallback BOOLEAN := FALSE;
BEGIN
  -- Drone-repair-intake: Rohit if available, else fall through to the regular pool
  IF NEW.form_type = 'drone-repair-intake' THEN
    IF public.is_user_available_on(v_rohit_id) THEN
      NEW.assigned_to := v_rohit_id;
      SELECT name INTO v_name FROM public.profiles WHERE user_id = v_rohit_id;
      NEW.assigned_to_name := COALESCE(v_name, 'Rohit');
      RETURN NEW;
    END IF;
  END IF;

  -- Determine the active pool size
  SELECT COUNT(*) INTO v_pool_size FROM public.available_website_lead_assignees();
  IF v_pool_size = 0 THEN
    SELECT COUNT(*) INTO v_pool_size FROM public.allowed_website_lead_assignees();
    v_using_fallback := TRUE;
  END IF;

  -- If the caller picked an allowed + available person, honour it
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT uname INTO v_name FROM public.allowed_website_lead_assignees() WHERE uid = NEW.assigned_to;
    IF v_name IS NOT NULL AND public.is_user_available_on(NEW.assigned_to) THEN
      NEW.assigned_to_name := v_name;
      RETURN NEW;
    END IF;
    -- else override below
  END IF;

  -- Round-robin over the current pool size
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

  -- Audit when the entire pool is out
  IF v_using_fallback AND TG_TABLE_NAME = 'leads' THEN
    NEW.message := COALESCE(NEW.message, '') ||
      E'\n[Auto-assigned via fallback — entire sales pool marked unavailable on ' ||
      to_char(now(), 'YYYY-MM-DD HH24:MI') || ']';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Update assign_lead_round_robin to also skip unavailable users
CREATE OR REPLACE FUNCTION public.assign_lead_round_robin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_user_id uuid;
  v_next_name text;
  v_last_assignee uuid;
BEGIN
  -- Drone-repair-intake routed via enforce_website_lead_assignment
  IF NEW.form_type = 'drone-repair-intake' THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NULL THEN
    WITH pool AS (
      SELECT p.user_id, p.name
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.is_approved = true
        AND ur.role IN ('sales', 'sales_manager')
        AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
        AND public.is_user_available_on(p.user_id, CURRENT_DATE)
      GROUP BY p.user_id, p.name
      ORDER BY p.user_id
    )
    SELECT assigned_to INTO v_last_assignee
    FROM public.form_leads
    WHERE assigned_to IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;

    SELECT user_id, name INTO v_next_user_id, v_next_name
    FROM pool
    WHERE v_last_assignee IS NULL OR user_id > v_last_assignee
    ORDER BY user_id LIMIT 1;

    IF v_next_user_id IS NULL THEN
      SELECT user_id, name INTO v_next_user_id, v_next_name
      FROM pool ORDER BY user_id LIMIT 1;
    END IF;

    -- Hard fallback: nobody available → ignore availability filter
    IF v_next_user_id IS NULL THEN
      WITH full_pool AS (
        SELECT p.user_id, p.name
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.user_id
        WHERE p.is_approved = true
          AND ur.role IN ('sales', 'sales_manager')
          AND COALESCE(p.name, '') !~* '(charles|fahad|umar|vishal)'
        GROUP BY p.user_id, p.name
        ORDER BY p.user_id
      )
      SELECT user_id, name INTO v_next_user_id, v_next_name
      FROM full_pool ORDER BY user_id LIMIT 1;
    END IF;

    IF v_next_user_id IS NOT NULL THEN
      NEW.assigned_to := v_next_user_id;
      NEW.assigned_to_name := v_next_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;