
-- 1. Add columns to repairs to capture full intake form data + source link
ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS intake_payload jsonb,
  ADD COLUMN IF NOT EXISTS source_lead_id bigint UNIQUE;

-- 2. Update the website-lead enforcement trigger to allow drone-repair-intake -> Rohit
CREATE OR REPLACE FUNCTION public.enforce_website_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_idx INT;
  v_uid UUID;
  v_name TEXT;
  v_rohit_id UUID := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
  v_allowed_ids UUID[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid,
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid
  ];
BEGIN
  -- Special-case: drone-repair-intake forms always go to Rohit (Supply Chain)
  IF NEW.form_type = 'drone-repair-intake' THEN
    NEW.assigned_to := v_rohit_id;
    SELECT name INTO v_name FROM public.profiles WHERE user_id = v_rohit_id;
    NEW.assigned_to_name := COALESCE(v_name, 'Rohit');
    RETURN NEW;
  END IF;

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
    SELECT uname INTO v_name
    FROM public.allowed_website_lead_assignees()
    WHERE uid = NEW.assigned_to;
    NEW.assigned_to_name := v_name;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Update round-robin trigger to skip drone-repair-intake (handled by enforce trigger)
CREATE OR REPLACE FUNCTION public.assign_lead_round_robin()
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
  -- Skip for drone-repair-intake (routed to Rohit via enforce_website_lead_assignment)
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

    IF v_next_user_id IS NOT NULL THEN
      NEW.assigned_to := v_next_user_id;
      NEW.assigned_to_name := v_next_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Backfill existing drone-repair-intake leads to Rohit
UPDATE public.leads
SET assigned_to = '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid,
    assigned_to_name = COALESCE((SELECT name FROM public.profiles WHERE user_id = '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid), 'Rohit')
WHERE form_type = 'drone-repair-intake';

-- 5. Function + trigger: auto-create a Repair record from drone-repair-intake leads
CREATE OR REPLACE FUNCTION public.create_repair_from_drone_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand text;
  v_model text;
  v_model_combined text;
  v_issue text;
  v_rohit_id UUID := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
  v_rohit_name text;
BEGIN
  IF NEW.form_type IS DISTINCT FROM 'drone-repair-intake' THEN
    RETURN NEW;
  END IF;

  -- Avoid duplicates if this lead already produced a repair
  IF EXISTS (SELECT 1 FROM public.repairs WHERE source_lead_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_brand := COALESCE(NEW.payload->>'drone_brand', '');
  v_model := COALESCE(NEW.payload->>'drone_model', '');
  v_model_combined := NULLIF(TRIM(BOTH ' ' FROM (v_brand || ' ' || v_model)), '');
  v_issue := COALESCE(NEW.payload->>'issues', NEW.message, '');

  SELECT name INTO v_rohit_name FROM public.profiles WHERE user_id = v_rohit_id;

  INSERT INTO public.repairs (
    customer_name,
    model_name,
    date_of_receipt,
    contact_no,
    issue_details,
    issue_type,
    components_replaced,
    inspection_charges,
    repair_cost_charged,
    payment_status,
    advance_amount,
    total_quote_amount,
    notes,
    email,
    intake_payload,
    source_lead_id,
    created_by,
    created_by_name
  ) VALUES (
    COALESCE(NEW.name, 'Unknown'),
    COALESCE(v_model_combined, 'Unknown model'),
    COALESCE(NEW.created_at::date, CURRENT_DATE),
    COALESCE(NEW.phone, ''),
    v_issue,
    'other',
    '[]'::jsonb,
    0,
    0,
    'pending',
    0,
    0,
    'Auto-created from website drone-repair-intake form. Page: ' || COALESCE(NEW.page_url, 'n/a'),
    NEW.email,
    NEW.payload,
    NEW.id,
    v_rohit_id,
    COALESCE(v_rohit_name, 'Rohit')
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_create_repair_from_drone_intake ON public.leads;
CREATE TRIGGER trg_create_repair_from_drone_intake
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.create_repair_from_drone_intake();

-- 6. Backfill: create repairs for existing drone-repair-intake leads not yet linked
INSERT INTO public.repairs (
  customer_name,
  model_name,
  date_of_receipt,
  contact_no,
  issue_details,
  issue_type,
  components_replaced,
  inspection_charges,
  repair_cost_charged,
  payment_status,
  advance_amount,
  total_quote_amount,
  notes,
  email,
  intake_payload,
  source_lead_id,
  created_by,
  created_by_name
)
SELECT
  COALESCE(l.name, 'Unknown'),
  NULLIF(TRIM(BOTH ' ' FROM (COALESCE(l.payload->>'drone_brand', '') || ' ' || COALESCE(l.payload->>'drone_model', ''))), '') ,
  COALESCE(l.created_at::date, CURRENT_DATE),
  COALESCE(l.phone, ''),
  COALESCE(l.payload->>'issues', l.message, ''),
  'other'::repair_issue_type,
  '[]'::jsonb,
  0,
  0,
  'pending'::repair_payment_status,
  0,
  0,
  'Auto-created from website drone-repair-intake form. Page: ' || COALESCE(l.page_url, 'n/a'),
  l.email,
  l.payload,
  l.id,
  '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid,
  COALESCE((SELECT name FROM public.profiles WHERE user_id = '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid), 'Rohit')
FROM public.leads l
WHERE l.form_type = 'drone-repair-intake'
  AND NOT EXISTS (SELECT 1 FROM public.repairs r WHERE r.source_lead_id = l.id);
