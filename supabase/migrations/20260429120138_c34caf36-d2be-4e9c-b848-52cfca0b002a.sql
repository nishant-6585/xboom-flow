
-- 1. Rotation state table (single-row pointer for round-robin)
CREATE TABLE IF NOT EXISTS public.lead_assignment_state (
  id INT PRIMARY KEY DEFAULT 1,
  next_index INT NOT NULL DEFAULT 0,
  CONSTRAINT lead_assignment_state_singleton CHECK (id = 1)
);
INSERT INTO public.lead_assignment_state (id, next_index)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.lead_assignment_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_assignment_state_admin_read" ON public.lead_assignment_state;
CREATE POLICY "lead_assignment_state_admin_read"
  ON public.lead_assignment_state FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Helper: returns the 4 allowed sales people in fixed order
CREATE OR REPLACE FUNCTION public.allowed_website_lead_assignees()
RETURNS TABLE(uid UUID, uname TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (VALUES
    ('e05f9afe-0160-4956-bb1f-496028386062'::uuid, 'Arjav chauhan'),
    ('a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, 'Narasimha'),
    ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, 'mohammed musthak'),
    ('456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, 'suman das')
  ) AS t(uid, uname);
$$;

-- 3. One-time rebalance of existing form_leads
WITH targets AS (
  SELECT * FROM (VALUES
    ('e05f9afe-0160-4956-bb1f-496028386062'::uuid, 'Arjav chauhan', 0),
    ('a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, 'Narasimha', 1),
    ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, 'mohammed musthak', 2),
    ('456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, 'suman das', 3)
  ) AS t(uid, uname, idx)
),
ordered AS (
  SELECT id, ((ROW_NUMBER() OVER (ORDER BY created_at)) - 1)::int % 4 AS bucket
  FROM public.form_leads
)
UPDATE public.form_leads fl
SET assigned_to = t.uid,
    assigned_to_name = t.uname,
    sales_person_id = t.uid,
    sales_person_name = t.uname,
    updated_at = now()
FROM ordered o
JOIN targets t ON t.idx = o.bucket
WHERE fl.id = o.id;

-- 4. One-time rebalance of existing public.leads (also website-form leads)
WITH targets AS (
  SELECT * FROM (VALUES
    ('e05f9afe-0160-4956-bb1f-496028386062'::uuid, 'Arjav chauhan', 0),
    ('a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, 'Narasimha', 1),
    ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, 'mohammed musthak', 2),
    ('456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, 'suman das', 3)
  ) AS t(uid, uname, idx)
),
ordered AS (
  SELECT id, ((ROW_NUMBER() OVER (ORDER BY created_at)) - 1)::int % 4 AS bucket
  FROM public.leads
)
UPDATE public.leads l
SET assigned_to = t.uid,
    assigned_to_name = t.uname
FROM ordered o
JOIN targets t ON t.idx = o.bucket
WHERE l.id = o.id;

-- 5. Sync the rotation pointer so future inserts continue from where we left off
UPDATE public.lead_assignment_state
SET next_index = ((SELECT COUNT(*) FROM public.form_leads) % 4)
WHERE id = 1;

-- 6. Trigger: enforce assignment only to the 4, and auto-assign on insert
CREATE OR REPLACE FUNCTION public.enforce_website_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx INT;
  v_uid UUID;
  v_name TEXT;
  v_allowed_ids UUID[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid,
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid
  ];
BEGIN
  -- If assigned_to is being set to someone outside the 4, override with round-robin
  IF NEW.assigned_to IS NULL OR NOT (NEW.assigned_to = ANY(v_allowed_ids)) THEN
    UPDATE public.lead_assignment_state
    SET next_index = (next_index + 1) % 4
    WHERE id = 1
    RETURNING ((next_index + 3) % 4) INTO v_idx;

    IF v_idx IS NULL THEN
      INSERT INTO public.lead_assignment_state (id, next_index) VALUES (1, 1)
      ON CONFLICT (id) DO UPDATE SET next_index = (public.lead_assignment_state.next_index + 1) % 4;
      v_idx := 0;
    END IF;

    SELECT uid, uname INTO v_uid, v_name
    FROM public.allowed_website_lead_assignees()
    OFFSET v_idx LIMIT 1;

    NEW.assigned_to := v_uid;
    NEW.assigned_to_name := v_name;
  ELSE
    -- Ensure the name matches the canonical name
    SELECT uname INTO v_name
    FROM public.allowed_website_lead_assignees()
    WHERE uid = NEW.assigned_to;
    NEW.assigned_to_name := v_name;
  END IF;

  RETURN NEW;
END;
$$;

-- Form leads: enforce on insert and on assigned_to update
DROP TRIGGER IF EXISTS trg_enforce_form_lead_assignment ON public.form_leads;
CREATE TRIGGER trg_enforce_form_lead_assignment
  BEFORE INSERT OR UPDATE OF assigned_to ON public.form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_website_lead_assignment();

-- Also keep sales_person_id/name in sync after the above runs
CREATE OR REPLACE FUNCTION public.sync_form_lead_sales_person()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.sales_person_id := NEW.assigned_to;
  NEW.sales_person_name := NEW.assigned_to_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_form_lead_sales_person ON public.form_leads;
CREATE TRIGGER trg_sync_form_lead_sales_person
  BEFORE INSERT OR UPDATE OF assigned_to ON public.form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_form_lead_sales_person();

-- Public.leads: enforce on insert and on assigned_to update
DROP TRIGGER IF EXISTS trg_enforce_lead_assignment ON public.leads;
CREATE TRIGGER trg_enforce_lead_assignment
  BEFORE INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_website_lead_assignment();
