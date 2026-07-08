
DO $$
DECLARE
  anvesh uuid := '7b4818c1-a3d0-44bc-9aac-3744e018e441';
  mushtaq uuid := '457fc2d5-9fc5-439a-938e-5b998549b811';
  mushtaq_name text := 'mohammed musthak';
BEGIN
  UPDATE enquiries SET sales_person_id = mushtaq, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh OR sales_person_name ILIKE '%anvesh%';

  UPDATE call_logs SET sales_person_id = mushtaq, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh OR sales_person_name ILIKE '%anvesh%';

  UPDATE leads SET assigned_to = mushtaq, assigned_to_name = mushtaq_name
    WHERE assigned_to = anvesh OR assigned_to_name ILIKE '%anvesh%';

  UPDATE form_leads SET sales_person_id = mushtaq, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh OR sales_person_name ILIKE '%anvesh%';

  UPDATE email_leads SET sales_person_id = mushtaq, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh OR sales_person_name ILIKE '%anvesh%';

  UPDATE interakt_leads SET sales_person_id = mushtaq::text, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh::text OR sales_person_name ILIKE '%anvesh%';

  UPDATE prospects SET created_by = mushtaq, created_by_name = mushtaq_name
    WHERE created_by = anvesh OR created_by_name ILIKE '%anvesh%';

  UPDATE pipeline_orders SET sales_person_id = mushtaq, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh OR sales_person_name ILIKE '%anvesh%';

  UPDATE google_ads_leads SET sales_person_id = mushtaq, sales_person_name = mushtaq_name
    WHERE sales_person_id = anvesh OR sales_person_name ILIKE '%anvesh%';
END $$;
