
CREATE OR REPLACE FUNCTION public.attendance_logs_self_time_lock(
  _id uuid,
  _check_in_time timestamp with time zone,
  _check_out_time timestamp with time zone,
  _working_hours numeric,
  _break_start_time timestamp with time zone,
  _break_end_time timestamp with time zone,
  _total_break_minutes numeric,
  _notes text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_hr_or_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attendance_logs a
      WHERE a.id = _id
        AND a.check_in_time        IS NOT DISTINCT FROM _check_in_time
        AND a.check_out_time       IS NOT DISTINCT FROM _check_out_time
        AND a.working_hours        IS NOT DISTINCT FROM _working_hours
        AND a.break_start_time     IS NOT DISTINCT FROM _break_start_time
        AND a.break_end_time       IS NOT DISTINCT FROM _break_end_time
        AND a.total_break_minutes  IS NOT DISTINCT FROM _total_break_minutes
        AND a.notes                IS NOT DISTINCT FROM _notes
    );
$function$;

DROP POLICY IF EXISTS "Employees can update own attendance" ON public.attendance_logs;
CREATE POLICY "Employees can update own attendance"
ON public.attendance_logs
FOR UPDATE
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND public.is_user_approved(auth.uid())
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND public.attendance_logs_self_update_check(
    id, status, approved_by, approved_by_name, reconciliation_status,
    auto_checkout_applied, auto_checkout_time, is_provisional_checkout,
    corrected_by, corrected_at, source
  )
  AND public.attendance_logs_self_time_lock(
    id, check_in_time, check_out_time, working_hours,
    break_start_time, break_end_time, total_break_minutes, notes
  )
);

DROP POLICY IF EXISTS "leads_select_sales_admin" ON public.leads;
CREATE POLICY "leads_select_sales_admin"
ON public.leads
FOR SELECT
USING (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      (public.has_role(auth.uid(), 'sales'::app_role)
        OR public.has_role(auth.uid(), 'sales_manager'::app_role))
      AND (
        page_url IS NULL
        OR (
          page_url !~~* '%sell-your-used-drones%'
          AND page_url !~~* '%rent-a-drone%'
          AND page_url !~~* '%drone-repair%'
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "leads_update_sales_admin" ON public.leads;
CREATE POLICY "leads_update_sales_admin"
ON public.leads
FOR UPDATE
USING (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR (public.has_role(auth.uid(), 'sales'::app_role) AND assigned_to = auth.uid())
  )
)
WITH CHECK (
  public.is_user_approved(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::app_role)
    OR (public.has_role(auth.uid(), 'sales'::app_role) AND assigned_to = auth.uid())
  )
);
