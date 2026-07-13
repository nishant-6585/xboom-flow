CREATE OR REPLACE FUNCTION public.list_pending_compoff_credits(
  p_search text DEFAULT NULL,
  p_worked_from date DEFAULT NULL,
  p_worked_to date DEFAULT NULL,
  p_expiry_filter text DEFAULT 'all',
  p_sort_by text DEFAULT 'submitted',
  p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  employee_name text,
  earned_date date,
  earned_type text,
  holiday_name text,
  created_at timestamptz,
  expires_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offset integer := GREATEST((COALESCE(p_page,1)-1) * COALESCE(p_page_size,25), 0);
  v_limit integer := LEAST(GREATEST(COALESCE(p_page_size,25),1), 200);
  v_dir text := CASE WHEN lower(COALESCE(p_sort_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_order_col text := CASE lower(COALESCE(p_sort_by,'submitted'))
    WHEN 'employee' THEN 'employee_name'
    WHEN 'worked'   THEN 'earned_date'
    WHEN 'expiry'   THEN 'expires_at'
    ELSE 'created_at'
  END;
  v_sql text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only HR or Admin can list pending comp-off credits';
  END IF;

  v_sql := format($f$
    WITH base AS (
      SELECT l.id, l.employee_id, e.name AS employee_name,
             l.earned_date, l.earned_type::text, l.holiday_name,
             l.created_at, (l.expires_at::timestamptz) AS expires_at
      FROM public.compoff_ledger l
      LEFT JOIN public.employees e ON e.id = l.employee_id
      WHERE l.approval_status = 'pending'
        AND (%1$L::text IS NULL OR e.name ILIKE '%%' || %1$L || '%%')
        AND (%2$L::date IS NULL OR l.earned_date >= %2$L::date)
        AND (%3$L::date IS NULL OR l.earned_date <= %3$L::date)
        AND (
          %4$L = 'all'
          OR (%4$L = 'expired' AND l.expires_at < CURRENT_DATE)
          OR (%4$L = 'expiring_7'  AND l.expires_at >= CURRENT_DATE AND l.expires_at <= CURRENT_DATE + 7)
          OR (%4$L = 'expiring_30' AND l.expires_at >= CURRENT_DATE AND l.expires_at <= CURRENT_DATE + 30)
        )
    ),
    counted AS (SELECT count(*) AS total_count FROM base)
    SELECT b.id, b.employee_id, b.employee_name, b.earned_date, b.earned_type,
           b.holiday_name, b.created_at, b.expires_at, c.total_count
    FROM base b CROSS JOIN counted c
    ORDER BY %5$I %6$s NULLS LAST, b.id ASC
    LIMIT %7$s OFFSET %8$s
  $f$, NULLIF(p_search,''), p_worked_from, p_worked_to, COALESCE(p_expiry_filter,'all'),
       v_order_col, v_dir, v_limit, v_offset);

  RETURN QUERY EXECUTE v_sql;
END; $$;