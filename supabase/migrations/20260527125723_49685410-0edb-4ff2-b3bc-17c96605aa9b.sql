
-- Add Srishti and Manoj to the website lead pool
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
    ('7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid, 'Manoj')
  ) AS t(uid, uname);
$function$;

-- Add Srishti and Manoj to the WooCommerce website pool
CREATE OR REPLACE FUNCTION public.enforce_woo_website_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pool uuid[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid, -- Arjav chauhan
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, -- Narasimha
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, -- mohammed musthak
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, -- suman das
    '74930912-193a-4081-a87f-46902ee96c4d'::uuid, -- Srishti
    '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid  -- Manoj
  ];
  v_pick uuid;
  v_name text;
BEGIN
  SELECT u
  INTO v_pick
  FROM unnest(v_pool) AS u
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS c
    FROM public.woocommerce_orders
    WHERE assigned_to = ANY(v_pool)
    GROUP BY assigned_to
  ) t ON t.assigned_to = u
  ORDER BY COALESCE(t.c, 0) ASC, random()
  LIMIT 1;

  SELECT name INTO v_name FROM public.profiles WHERE user_id = v_pick;

  NEW.assigned_to := v_pick;
  NEW.assigned_to_name := v_name;
  NEW.assigned_at := now();
  RETURN NEW;
END;
$function$;
