
CREATE OR REPLACE FUNCTION public.get_employees_on_leave_today()
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  department text,
  designation text,
  leave_type text,
  start_date date,
  end_date date,
  is_half_day boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.name,
    e.department,
    e.designation,
    lr.leave_type,
    lr.start_date,
    lr.end_date,
    (lr.leave_type LIKE 'half_day%') AS is_half_day
  FROM public.leave_requests lr
  JOIN public.employees e ON e.id = lr.employee_id
  WHERE lr.status = 'approved'
    AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date
    AND e.is_active = true
    AND lr.leave_type NOT IN ('wfh')
  ORDER BY e.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_employees_on_leave_today() TO authenticated;
