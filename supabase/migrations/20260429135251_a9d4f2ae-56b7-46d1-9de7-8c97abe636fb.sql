-- Round-robin auto-assignment for Xboom Website (WooCommerce) leads
-- Pool: Arjav, Narasimha, Mohammed Musthak, Suman Das

CREATE OR REPLACE FUNCTION public.enforce_woo_website_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool uuid[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::uuid, -- Arjav chauhan
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, -- Narasimha
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, -- mohammed musthak
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid  -- suman das
  ];
  v_pick uuid;
  v_name text;
BEGIN
  -- Pick the salesperson with the fewest existing assignments (round-robin balancing).
  SELECT u, COALESCE(c, 0) AS cnt
  INTO v_pick
  FROM unnest(v_pool) AS u
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS c
    FROM public.woocommerce_orders
    WHERE assigned_to = ANY(v_pool)
    GROUP BY assigned_to
  ) t ON t.assigned_to = u
  ORDER BY COALESCE(c, 0) ASC, random()
  LIMIT 1;

  SELECT name INTO v_name FROM public.profiles WHERE user_id = v_pick;

  NEW.assigned_to := v_pick;
  NEW.assigned_to_name := v_name;
  NEW.assigned_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_woo_website_lead_assignment ON public.woocommerce_orders;
CREATE TRIGGER trg_enforce_woo_website_lead_assignment
BEFORE INSERT ON public.woocommerce_orders
FOR EACH ROW
WHEN (NEW.assigned_to IS NULL)
EXECUTE FUNCTION public.enforce_woo_website_lead_assignment();

-- Backfill: evenly distribute currently unassigned leads
WITH pool AS (
  SELECT * FROM (VALUES
    ('e05f9afe-0160-4956-bb1f-496028386062'::uuid, 'Arjav chauhan'),
    ('a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid, 'Narasimha'),
    ('457fc2d5-9fc5-439a-938e-5b998549b811'::uuid, 'mohammed musthak'),
    ('456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid, 'suman das')
  ) AS t(uid, name)
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY woo_created_at DESC NULLS LAST, id) - 1 AS rn
  FROM public.woocommerce_orders
  WHERE assigned_to IS NULL
),
assigned AS (
  SELECT r.id, p.uid, p.name
  FROM ranked r
  JOIN (SELECT uid, name, ROW_NUMBER() OVER () - 1 AS idx FROM pool) p
    ON p.idx = r.rn % 4
)
UPDATE public.woocommerce_orders w
SET assigned_to = a.uid,
    assigned_to_name = a.name,
    assigned_at = now()
FROM assigned a
WHERE w.id = a.id;