
-- ============================================================
-- 1. Scope notifications visibility: no one sees another user's
--    personal notifications (rows with user_id set to someone else).
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
CREATE POLICY "Admins can view non-personal notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = auth.uid() AND role = 'admin'::app_role)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Finance can view payment notifications" ON public.notifications;
CREATE POLICY "Finance can view payment notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = auth.uid() AND role = 'finance'::app_role)
    AND (target_role IS NULL OR target_role IN ('finance','supply_chain'))
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Sales can view sales notifications" ON public.notifications;
CREATE POLICY "Sales can view sales notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = auth.uid()
               AND role = ANY (ARRAY['sales'::app_role,'sales_manager'::app_role]))
    AND (target_role IS NULL OR target_role IN ('sales','sales_manager'))
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Supply chain can view relevant notifications" ON public.notifications;
CREATE POLICY "Supply chain can view relevant notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = auth.uid() AND role = 'supply_chain'::app_role)
    AND (target_role IS NULL OR target_role = 'supply_chain')
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- ============================================================
-- 2. Per-type dedupe protection for enquiry_response / order_confirmed_by_customer
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS notifications_enquiry_order_dedupe
  ON public.notifications (user_id, type, title, (timezone('UTC', created_at)::date))
  WHERE type IN ('enquiry_response','order_confirmed_by_customer')
    AND user_id IS NOT NULL;

-- ============================================================
-- 3. Column-scoped guard triggers for lead tables
--    Non-managers may edit working fields (status, notes, follow-up dates)
--    but not ownership/audit columns.
-- ============================================================

-- call_logs
CREATE OR REPLACE FUNCTION public.guard_call_logs_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'sales_manager') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to     IS DISTINCT FROM OLD.assigned_to
  OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  OR NEW.lead_source     IS DISTINCT FROM OLD.lead_source
  THEN
    RAISE EXCEPTION 'Only admin or sales manager can modify ownership/source fields on call_logs.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_call_logs_sensitive_updates ON public.call_logs;
CREATE TRIGGER trg_guard_call_logs_sensitive_updates
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_call_logs_sensitive_updates();

-- email_leads
CREATE OR REPLACE FUNCTION public.guard_email_leads_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'sales_manager') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to     IS DISTINCT FROM OLD.assigned_to
  OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  OR NEW.lead_source     IS DISTINCT FROM OLD.lead_source
  OR NEW.mail_source     IS DISTINCT FROM OLD.mail_source
  THEN
    RAISE EXCEPTION 'Only admin or sales manager can modify ownership/source fields on email_leads.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_email_leads_sensitive_updates ON public.email_leads;
CREATE TRIGGER trg_guard_email_leads_sensitive_updates
  BEFORE UPDATE ON public.email_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_email_leads_sensitive_updates();

-- form_leads
CREATE OR REPLACE FUNCTION public.guard_form_leads_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'sales_manager') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to     IS DISTINCT FROM OLD.assigned_to
  OR NEW.sales_person_id IS DISTINCT FROM OLD.sales_person_id
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only admin or sales manager can modify ownership fields on form_leads.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_form_leads_sensitive_updates ON public.form_leads;
CREATE TRIGGER trg_guard_form_leads_sensitive_updates
  BEFORE UPDATE ON public.form_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_form_leads_sensitive_updates();
