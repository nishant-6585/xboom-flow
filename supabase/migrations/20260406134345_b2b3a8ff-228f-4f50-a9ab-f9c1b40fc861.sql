
-- Fix trigger function with correct Rohit user_id
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
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.form_name ILIKE '%contact%us%' THEN
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
$$;

-- Fix existing leads assigned to wrong Rohit ID
UPDATE public.form_leads
SET assigned_to = '9fea57d6-a27a-4b35-9293-e2151b84f45a',
    assigned_to_name = 'Rohit'
WHERE assigned_to = '4a8b29ce-646c-422e-a545-3f587c02c3ab';
