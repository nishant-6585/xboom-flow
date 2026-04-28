
-- 1. Restrict round-robin to Musthak + Narasimha
CREATE OR REPLACE FUNCTION public.auto_assign_salesperson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_counter INTEGER;
  v_idx INTEGER;
  v_ids UUID[] := ARRAY[
    '457fc2d5-9fc5-439a-938e-5b998549b811',  -- mohammed musthak
    'a790b58d-8e3d-4333-b6d6-08be631c865d'   -- Narasimha
  ];
  v_names TEXT[] := ARRAY['mohammed musthak', 'Narasimha'];
BEGIN
  IF NEW.sales_person_id IS NOT NULL AND NEW.sales_person_name IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.lead_assignment_counter SET counter = counter + 1 WHERE id = 1 RETURNING counter INTO v_counter;
  v_idx := ((v_counter - 1) % 2) + 1;

  NEW.sales_person_id := v_ids[v_idx];
  NEW.sales_person_name := v_names[v_idx];

  RETURN NEW;
END;
$function$;

-- 2. Reassign existing Interakt leads currently held by other people, split evenly
WITH to_move AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.interakt_leads
  WHERE sales_person_id NOT IN (
    '457fc2d5-9fc5-439a-938e-5b998549b811',
    'a790b58d-8e3d-4333-b6d6-08be631c865d'
  )
  OR sales_person_id IS NULL
)
UPDATE public.interakt_leads l
SET sales_person_id = CASE WHEN tm.rn % 2 = 1
                           THEN '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid
                           ELSE 'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid END,
    sales_person_name = CASE WHEN tm.rn % 2 = 1 THEN 'mohammed musthak' ELSE 'Narasimha' END,
    updated_at = now()
FROM to_move tm
WHERE l.id = tm.id;
