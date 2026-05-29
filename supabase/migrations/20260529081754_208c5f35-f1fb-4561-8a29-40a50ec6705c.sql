
-- 1. Fix the assignee picker function to use the canonical profile name "Manoj Kumar"
CREATE OR REPLACE FUNCTION public.allowed_website_lead_assignees()
 RETURNS TABLE(uid uuid, uname text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    ('e05f9afe-0160-4956-bb1f-496028386062'::uuid, 'Arjav chauhan'),
    ('a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, 'Narasimha'),
    ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, 'mohammed musthak'),
    ('456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, 'suman das'),
    ('74930912-193a-4081-a87f-46902ee96c4d'::uuid, 'Srishti'),
    ('7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid, 'Manoj Kumar')
  ) AS t(uid, uname);
$function$;

-- 2. Backfill: merge every "Manoj" assignment into "Manoj Kumar" across all lead tables
UPDATE public.call_logs       SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.interakt_leads  SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.email_leads     SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.form_leads      SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.google_ads_leads SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.orders          SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.enquiries       SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';
UPDATE public.pipeline_orders SET sales_person_name='Manoj Kumar' WHERE sales_person_name='Manoj';

-- 3. Safety net: ensure correct sales_person_id is set for any "Manoj Kumar" rows
UPDATE public.call_logs       SET sales_person_id='7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'
  WHERE sales_person_name='Manoj Kumar' AND sales_person_id IS DISTINCT FROM '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90';
UPDATE public.interakt_leads  SET sales_person_id='7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'
  WHERE sales_person_name='Manoj Kumar' AND sales_person_id IS DISTINCT FROM '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90';
UPDATE public.email_leads     SET sales_person_id='7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'
  WHERE sales_person_name='Manoj Kumar' AND sales_person_id IS DISTINCT FROM '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90';
UPDATE public.form_leads      SET sales_person_id='7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'
  WHERE sales_person_name='Manoj Kumar' AND sales_person_id IS DISTINCT FROM '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90';
