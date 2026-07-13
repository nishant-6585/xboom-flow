
-- 1) Notification log for compoff decision emails
CREATE TABLE IF NOT EXISTS public.compoff_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES public.compoff_ledger(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  recipient_email text,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  comment text,
  reason text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.compoff_notification_log TO authenticated;
GRANT ALL ON public.compoff_notification_log TO service_role;

ALTER TABLE public.compoff_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_admin_read_compoff_notif_log" ON public.compoff_notification_log;
CREATE POLICY "hr_admin_read_compoff_notif_log"
  ON public.compoff_notification_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "hr_admin_write_compoff_notif_log" ON public.compoff_notification_log;
CREATE POLICY "hr_admin_write_compoff_notif_log"
  ON public.compoff_notification_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "hr_admin_update_compoff_notif_log" ON public.compoff_notification_log;
CREATE POLICY "hr_admin_update_compoff_notif_log"
  ON public.compoff_notification_log FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'hr') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_compoff_notif_status ON public.compoff_notification_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compoff_notif_ledger ON public.compoff_notification_log (ledger_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_compoff_notif_updated_at ON public.compoff_notification_log;
CREATE TRIGGER trg_compoff_notif_updated_at
  BEFORE UPDATE ON public.compoff_notification_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Server-side paginated listing of pending compoff credits
CREATE OR REPLACE FUNCTION public.list_pending_compoff_credits(
  p_search text DEFAULT NULL,
  p_worked_from date DEFAULT NULL,
  p_worked_to date DEFAULT NULL,
  p_expiry_filter text DEFAULT 'all',   -- 'all' | 'expired' | 'expiring_7' | 'expiring_30'
  p_sort_by text DEFAULT 'submitted',   -- 'employee' | 'worked' | 'expiry' | 'submitted'
  p_sort_dir text DEFAULT 'desc',       -- 'asc' | 'desc'
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
             l.created_at, l.expires_at
      FROM public.compoff_ledger l
      LEFT JOIN public.employees e ON e.id = l.employee_id
      WHERE l.approval_status = 'pending'
        AND (%1$L::text IS NULL OR e.name ILIKE '%%' || %1$L || '%%')
        AND (%2$L::date IS NULL OR l.earned_date >= %2$L::date)
        AND (%3$L::date IS NULL OR l.earned_date <= %3$L::date)
        AND (
          %4$L = 'all'
          OR (%4$L = 'expired' AND l.expires_at < now())
          OR (%4$L = 'expiring_7'  AND l.expires_at >= now() AND l.expires_at <= now() + interval '7 days')
          OR (%4$L = 'expiring_30' AND l.expires_at >= now() AND l.expires_at <= now() + interval '30 days')
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

GRANT EXECUTE ON FUNCTION public.list_pending_compoff_credits(text,date,date,text,text,text,integer,integer) TO authenticated;
