-- Fix: MyOperator (and ElevenLabs) call logs appearing "Unassigned" in UI
-- Root cause: allowed_website_lead_assignees() returned 'Srishti' but the
-- profile name is 'Srishti Suman'. The Select dropdown in CallLogsPanel
-- compares sales_person_name to profile names exactly, so any row assigned
-- to Srishti via round-robin showed as blank/Unassigned.

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
    ('74930912-193a-4081-a87f-46902ee96c4d'::uuid, 'Srishti Suman'),
    ('7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid, 'Manoj Kumar')
  ) AS t(uid, uname);
$function$;

-- Backfill existing rows that show the short "Srishti" name
UPDATE public.call_logs
   SET sales_person_name = 'Srishti Suman'
 WHERE sales_person_id = '74930912-193a-4081-a87f-46902ee96c4d'
   AND sales_person_name = 'Srishti';
