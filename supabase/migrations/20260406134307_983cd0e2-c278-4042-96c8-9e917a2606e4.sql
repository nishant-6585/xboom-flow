
-- Create a counter table for Contact Us round-robin
CREATE TABLE IF NOT EXISTS public.form_lead_contact_us_counter (
  id integer PRIMARY KEY DEFAULT 1,
  counter integer NOT NULL DEFAULT 0,
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.form_lead_contact_us_counter (id, counter) VALUES (1, 0) ON CONFLICT DO NOTHING;

-- Create trigger function for auto-assigning form leads
CREATE OR REPLACE FUNCTION public.auto_assign_form_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assignees text[];
  _user_ids uuid[];
  _idx integer;
  _counter integer;
BEGIN
  -- Only auto-assign if not already assigned
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mapping based on form_name
  IF NEW.form_name ILIKE '%contact%us%' THEN
    -- Round-robin: Arjav, Suman, Narasimha
    _user_ids := ARRAY[
      'e05f9afe-0160-4956-bb1f-496028386062'::uuid,
      '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,
      'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid
    ];
    _assignees := ARRAY['Arjav chauhan', 'suman das', 'Narasimha'];

    UPDATE form_lead_contact_us_counter SET counter = counter + 1 WHERE id = 1 RETURNING counter INTO _counter;
    _idx := ((_counter - 1) % 3) + 1;

    NEW.assigned_to := _user_ids[_idx];
    NEW.assigned_to_name := _assignees[_idx];

  ELSIF NEW.form_name ILIKE '%resell%' OR NEW.form_name ILIKE '%sell%used%' OR NEW.form_name ILIKE '%rental%' OR NEW.form_name ILIKE '%repair%' THEN
    -- Rohit
    NEW.assigned_to := '4a8b29ce-646c-422e-a545-3f587c02c3ab'::uuid;
    NEW.assigned_to_name := 'Rohit Kumar';

  ELSIF NEW.form_name ILIKE '%pilot%training%' OR NEW.form_name ILIKE '%training%pilot%' THEN
    -- Narasimha
    NEW.assigned_to := 'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid;
    NEW.assigned_to_name := 'Narasimha';

  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_auto_assign_form_lead ON public.form_leads;
CREATE TRIGGER trg_auto_assign_form_lead
  BEFORE INSERT ON public.form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_form_lead();

-- Now update existing unassigned form leads
-- Resell / Rental / Repair → Rohit
UPDATE public.form_leads
SET assigned_to = '4a8b29ce-646c-422e-a545-3f587c02c3ab',
    assigned_to_name = 'Rohit Kumar'
WHERE assigned_to IS NULL
  AND (form_name ILIKE '%resell%' OR form_name ILIKE '%sell%used%' OR form_name ILIKE '%rental%' OR form_name ILIKE '%repair%');

-- Pilot Training → Narasimha
UPDATE public.form_leads
SET assigned_to = 'a790b58d-8e3d-4333-b6d6-08be631c865d',
    assigned_to_name = 'Narasimha'
WHERE assigned_to IS NULL
  AND (form_name ILIKE '%pilot%training%' OR form_name ILIKE '%training%pilot%');

-- Contact Us → round-robin for existing
DO $$
DECLARE
  _rec RECORD;
  _user_ids uuid[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid
  ];
  _names text[] := ARRAY['Arjav chauhan', 'suman das', 'Narasimha'];
  _i integer := 0;
BEGIN
  FOR _rec IN
    SELECT id FROM form_leads
    WHERE assigned_to IS NULL AND form_name ILIKE '%contact%us%'
    ORDER BY created_at
  LOOP
    UPDATE form_leads
    SET assigned_to = _user_ids[(_i % 3) + 1],
        assigned_to_name = _names[(_i % 3) + 1]
    WHERE id = _rec.id;
    _i := _i + 1;
  END LOOP;
END;
$$;
