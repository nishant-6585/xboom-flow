CREATE OR REPLACE FUNCTION public.get_company_followups(_company_id uuid)
RETURNS SETOF public.followups
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM public.followups f
  WHERE
    (f.source_type = 'company' AND f.source_id = _company_id)
    OR (f.source_type = 'prospect' AND f.source_id IN (
      SELECT p.id FROM public.prospects p WHERE p.company_id = _company_id
    ))
    OR (f.source_type = 'pipeline' AND f.source_id IN (
      SELECT po.id FROM public.pipeline_orders po WHERE po.company_id = _company_id
    ))
    OR (f.source_type = 'enquiry' AND f.source_id IN (
      SELECT e.id FROM public.enquiries e WHERE e.company_id = _company_id
    ))
  ORDER BY f.followup_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_followups(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_all_company_followups()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  source_type text,
  source_id uuid,
  customer_name text,
  customer_company text,
  product_name text,
  phone text,
  email text,
  is_a_category boolean,
  followup_at timestamptz,
  reminder_sent boolean,
  status text,
  remark text,
  completed_at timestamptz,
  completed_by uuid,
  completed_by_name text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  company_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*, f.source_id AS company_id
  FROM public.followups f
  WHERE f.source_type = 'company' AND f.status IN ('pending','missed')

  UNION ALL

  SELECT f.*, p.company_id
  FROM public.followups f
  JOIN public.prospects p ON p.id = f.source_id
  WHERE f.source_type = 'prospect' AND f.status IN ('pending','missed') AND p.company_id IS NOT NULL

  UNION ALL

  SELECT f.*, po.company_id
  FROM public.followups f
  JOIN public.pipeline_orders po ON po.id = f.source_id
  WHERE f.source_type = 'pipeline' AND f.status IN ('pending','missed') AND po.company_id IS NOT NULL

  UNION ALL

  SELECT f.*, e.company_id
  FROM public.followups f
  JOIN public.enquiries e ON e.id = f.source_id
  WHERE f.source_type = 'enquiry' AND f.status IN ('pending','missed') AND e.company_id IS NOT NULL
  ;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_company_followups() TO authenticated;