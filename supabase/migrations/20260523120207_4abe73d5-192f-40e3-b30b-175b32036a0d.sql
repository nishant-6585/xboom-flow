
-- Reps to distribute across
WITH reps(idx, user_id, name) AS (
  VALUES
    (0, '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, 'suman das'),
    (1, 'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, 'Narasimha'),
    (2, '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, 'mohammed musthak'),
    (3, 'e05f9afe-0160-4956-bb1f-496028386062'::uuid, 'Arjav chauhan'),
    (4, '74930912-193a-4081-a87f-46902ee96c4d'::uuid, 'Srishti Suman'),
    (5, '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid, 'Manoj Kumar')
)
SELECT 1;

-- ElevenLabs
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM call_logs WHERE lead_source = 'ElevenLabs'
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE call_logs c SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE c.id = rk.id;

-- MyOperator / other call_logs (only un-converted)
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM call_logs WHERE (lead_source IS NULL OR lead_source <> 'ElevenLabs')
    AND COALESCE(is_enquiry_converted, false) = false
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE call_logs c SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE c.id = rk.id;

-- form_leads
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM form_leads WHERE COALESCE(is_enquiry_converted, false) = false
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE form_leads f SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE f.id = rk.id;

-- email_leads
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM email_leads WHERE COALESCE(is_enquiry_converted, false) = false
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE email_leads e SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE e.id = rk.id;

-- interakt_leads
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM interakt_leads WHERE COALESCE(is_enquiry_converted, false) = false
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE interakt_leads i SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE i.id = rk.id;

-- google_ads_leads
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM google_ads_leads
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE google_ads_leads g SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE g.id = rk.id;

-- enquiries
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) % 6 AS bucket
  FROM enquiries
), reps(bucket, uid, nm) AS (VALUES
  (0,'456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid,'suman das'),
  (1,'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,'Narasimha'),
  (2,'457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,'mohammed musthak'),
  (3,'e05f9afe-0160-4956-bb1f-496028386062'::uuid,'Arjav chauhan'),
  (4,'74930912-193a-4081-a87f-46902ee96c4d'::uuid,'Srishti Suman'),
  (5,'7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,'Manoj Kumar'))
UPDATE enquiries e SET sales_person_id = r.uid, sales_person_name = r.nm
FROM ranked rk JOIN reps r ON r.bucket = rk.bucket
WHERE e.id = rk.id;
