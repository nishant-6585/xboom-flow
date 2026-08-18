-- Portal ticket routing overhaul — supply-chain alerting + assignment

CREATE INDEX IF NOT EXISTS idx_portal_tickets_assigned_to
  ON public.portal_tickets(assigned_to) WHERE assigned_to IS NOT NULL;

DROP POLICY IF EXISTS "portal_tickets: supply chain manages website orders"
  ON public.portal_tickets;
CREATE POLICY "portal_tickets: supply chain manages all"
ON public.portal_tickets
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'supply_chain'::app_role))
WITH CHECK (has_role(auth.uid(), 'supply_chain'::app_role));

DROP POLICY IF EXISTS "portal_messages: supply chain manages website orders"
  ON public.portal_ticket_messages;
CREATE POLICY "portal_messages: supply chain manages all"
ON public.portal_ticket_messages
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'supply_chain'::app_role))
WITH CHECK (has_role(auth.uid(), 'supply_chain'::app_role));

DROP FUNCTION IF EXISTS public.list_portal_ticket_inbox();
CREATE OR REPLACE FUNCTION public.list_portal_ticket_inbox()
RETURNS TABLE (
  id uuid,
  ticket_number text,
  subject text,
  status text,
  priority text,
  ticket_type text,
  category text,
  account_id uuid,
  company_name text,
  related_order_id uuid,
  related_order_number text,
  related_product_name text,
  customer_email text,
  item_summary text,
  assigned_to uuid,
  assigned_to_name text,
  created_at timestamptz,
  updated_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  sla_first_response_due_at timestamptz,
  sla_resolution_due_at timestamptz,
  last_message_at timestamptz,
  last_message_by_customer boolean,
  unread_customer_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'support'::app_role);
  v_is_sales boolean := has_role(v_uid, 'sales'::app_role) OR has_role(v_uid, 'sales_manager'::app_role);
  v_is_sc    boolean := has_role(v_uid, 'supply_chain'::app_role);
BEGIN
  IF v_uid IS NULL OR NOT (v_is_admin OR v_is_sales OR v_is_sc) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH staff_users AS (
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role IN ('admin'::app_role, 'support'::app_role,
                        'sales'::app_role, 'sales_manager'::app_role,
                        'supply_chain'::app_role)
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.ticket_id)
           m.ticket_id, m.created_at, m.sender_id
      FROM public.portal_ticket_messages m
     WHERE m.is_internal = false
     ORDER BY m.ticket_id, m.created_at DESC
  ),
  last_staff AS (
    SELECT m.ticket_id, max(m.created_at) AS last_staff_at
      FROM public.portal_ticket_messages m
      JOIN staff_users s ON s.user_id = m.sender_id
     WHERE m.is_internal = false
     GROUP BY m.ticket_id
  ),
  my_reads AS (
    SELECT r.ticket_id, r.last_read_at
      FROM public.portal_ticket_reads r
     WHERE r.user_id = v_uid
  ),
  unread AS (
    SELECT m.ticket_id, count(*)::int AS cnt
      FROM public.portal_ticket_messages m
      LEFT JOIN last_staff ls ON ls.ticket_id = m.ticket_id
      LEFT JOIN my_reads   mr ON mr.ticket_id = m.ticket_id
     WHERE m.is_internal = false
       AND NOT EXISTS (SELECT 1 FROM staff_users s WHERE s.user_id = m.sender_id)
       AND (ls.last_staff_at IS NULL OR m.created_at > ls.last_staff_at)
       AND (mr.last_read_at  IS NULL OR m.created_at > mr.last_read_at)
     GROUP BY m.ticket_id
  ),
  order_items_agg AS (
    SELECT oi.order_id,
           string_agg(
             oi.product_name || ' × ' || oi.quantity::text,
             ', '
             ORDER BY oi.created_at
           ) AS item_summary
      FROM public.order_items oi
     GROUP BY oi.order_id
  )
  SELECT t.id,
         t.ticket_number,
         t.subject,
         t.status,
         t.priority,
         t.ticket_type,
         t.category,
         t.account_id,
         a.company_name,
         t.related_order_id,
         t.related_order_number,
         t.related_product_name,
         COALESCE(o.customer_email, NULL) AS customer_email,
         oia.item_summary,
         t.assigned_to,
         COALESCE(NULLIF(p.name, ''), p.email) AS assigned_to_name,
         t.created_at,
         t.updated_at,
         t.first_response_at,
         t.resolved_at,
         t.sla_first_response_due_at,
         t.sla_resolution_due_at,
         lm.created_at AS last_message_at,
         (lm.sender_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM staff_users s WHERE s.user_id = lm.sender_id)
         ) AS last_message_by_customer,
         COALESCE(u.cnt, 0) AS unread_customer_count
    FROM public.portal_tickets t
    LEFT JOIN public.portal_accounts a ON a.id = t.account_id
    LEFT JOIN public.orders           o ON o.id = t.related_order_id
    LEFT JOIN public.profiles         p ON p.user_id = t.assigned_to
    LEFT JOIN order_items_agg      oia ON oia.order_id = t.related_order_id
    LEFT JOIN last_msg              lm ON lm.ticket_id = t.id
    LEFT JOIN unread                u  ON u.ticket_id  = t.id
   WHERE v_is_admin
      OR v_is_sc
      OR (v_is_sales AND (
            a.assigned_rep_id = v_uid
         OR t.assigned_to = v_uid
         OR EXISTS (SELECT 1 FROM public.orders o2
                     WHERE o2.id = t.related_order_id
                       AND o2.sales_person_id = v_uid)
         ))
   ORDER BY (COALESCE(u.cnt, 0) > 0) DESC,
            COALESCE(lm.created_at, t.created_at) DESC
   LIMIT 300;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_ticket_notify_targets(_ticket_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT DISTINCT x.user_id
    FROM (
      SELECT t.assigned_to AS user_id
        FROM public.portal_tickets t WHERE t.id = _ticket_id
      UNION
      SELECT o.sales_person_id
        FROM public.portal_tickets t
        JOIN public.orders o ON o.id = t.related_order_id
       WHERE t.id = _ticket_id
      UNION
      SELECT a.assigned_rep_id
        FROM public.portal_tickets t
        JOIN public.portal_accounts a ON a.id = t.account_id
       WHERE t.id = _ticket_id
      UNION
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('supply_chain'::app_role,
                         'admin'::app_role,
                         'sales_manager'::app_role)
    ) x
   WHERE x.user_id IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION public.portal_ticket_dispatch_alert(
  _event      text,
  _ticket_id  uuid,
  _message_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/portal-ticket-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
        'x-cron-secret', COALESCE(public.get_cron_secret(), '')
      ),
      body := jsonb_build_object(
        'event', _event,
        'ticket_id', _ticket_id,
        'message_id', _message_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_tickets_notify_supply_chain ON public.portal_tickets;
DROP TRIGGER IF EXISTS trg_notify_sales_on_portal_ticket_created ON public.portal_tickets;

CREATE OR REPLACE FUNCTION public.portal_tickets_notify_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company text;
  v_title   text;
  v_message text;
  r         record;
BEGIN
  SELECT a.company_name INTO v_company
    FROM public.portal_accounts a WHERE a.id = NEW.account_id;

  v_title := CASE WHEN NEW.ticket_type = 'service_request'
                  THEN 'New service request: ' || NEW.ticket_number
                  ELSE 'New customer ticket: ' || NEW.ticket_number END;
  v_message := COALESCE(v_company, 'Portal customer')
            || COALESCE(' · Order ' || NEW.related_order_number, '')
            || ' — ' || COALESCE(NEW.subject, 'No subject');

  FOR r IN SELECT * FROM public.portal_ticket_notify_targets(NEW.id) LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, order_id, portal_ticket_id, account_id,
       target_role, metadata)
    VALUES
      (r.user_id, 'portal_ticket_created', v_title, v_message,
       NEW.related_order_id, NEW.id, NEW.account_id, NULL,
       jsonb_build_object(
         'ticket_number', NEW.ticket_number,
         'priority', NEW.priority,
         'ticket_type', NEW.ticket_type,
         'company_name', v_company,
         'unassigned', NEW.assigned_to IS NULL
       ));
  END LOOP;

  PERFORM public.portal_ticket_dispatch_alert('ticket_created', NEW.id, NULL);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_tickets_notify_staff ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_notify_staff
  AFTER INSERT ON public.portal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.portal_tickets_notify_staff();

CREATE OR REPLACE FUNCTION public.portal_ticket_messages_notify_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ticket  public.portal_tickets%ROWTYPE;
  v_company text;
  v_staff   boolean;
  v_title   text;
  v_message text;
  r         record;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  v_staff := EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = NEW.sender_id
       AND ur.role IN ('admin'::app_role, 'support'::app_role, 'sales'::app_role,
                       'sales_manager'::app_role, 'supply_chain'::app_role)
  );
  IF v_staff THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.portal_ticket_messages m
     WHERE m.ticket_id = NEW.ticket_id
       AND m.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ticket FROM public.portal_tickets t WHERE t.id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT a.company_name INTO v_company
    FROM public.portal_accounts a WHERE a.id = v_ticket.account_id;

  v_title := 'Customer replied on ' || v_ticket.ticket_number;
  v_message := COALESCE(NEW.sender_name_snapshot, COALESCE(v_company, 'Customer'))
            || ': ' || left(COALESCE(NEW.body, ''), 160);

  FOR r IN SELECT * FROM public.portal_ticket_notify_targets(v_ticket.id) LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, order_id, portal_ticket_id, account_id,
       target_role, metadata)
    VALUES
      (r.user_id, 'portal_ticket_message', v_title, v_message,
       v_ticket.related_order_id, v_ticket.id, v_ticket.account_id, NULL,
       jsonb_build_object(
         'ticket_number', v_ticket.ticket_number,
         'priority', v_ticket.priority,
         'ticket_type', v_ticket.ticket_type,
         'company_name', v_company,
         'message_id', NEW.id,
         'unassigned', v_ticket.assigned_to IS NULL
       ));
  END LOOP;

  PERFORM public.portal_ticket_dispatch_alert(
    'ticket_reply_to_staff', v_ticket.id, NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_ticket_messages_notify_staff
  ON public.portal_ticket_messages;
CREATE TRIGGER trg_portal_ticket_messages_notify_staff
  AFTER INSERT ON public.portal_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.portal_ticket_messages_notify_staff();

CREATE OR REPLACE FUNCTION public.portal_tickets_notify_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company text;
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT a.company_name INTO v_company
    FROM public.portal_accounts a WHERE a.id = NEW.account_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, order_id, portal_ticket_id, account_id,
     target_role, metadata)
  VALUES
    (NEW.assigned_to, 'portal_ticket_assigned',
     'Ticket assigned to you: ' || NEW.ticket_number,
     COALESCE(v_company, 'Portal customer') || ' — ' || COALESCE(NEW.subject, ''),
     NEW.related_order_id, NEW.id, NEW.account_id, NULL,
     jsonb_build_object(
       'ticket_number', NEW.ticket_number,
       'priority', NEW.priority,
       'ticket_type', NEW.ticket_type,
       'company_name', v_company
     ));

  PERFORM public.portal_ticket_dispatch_alert('ticket_assigned', NEW.id, NULL);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_tickets_notify_assignment ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_notify_assignment
  AFTER UPDATE OF assigned_to ON public.portal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.portal_tickets_notify_assignment();

CREATE OR REPLACE FUNCTION public.assign_portal_ticket(
  _ticket_id uuid,
  _user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (has_role(v_uid, 'admin'::app_role)
       OR has_role(v_uid, 'support'::app_role)
       OR has_role(v_uid, 'sales_manager'::app_role)
       OR has_role(v_uid, 'supply_chain'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id
       AND ur.role IN ('supply_chain'::app_role, 'admin'::app_role,
                       'support'::app_role, 'sales'::app_role,
                       'sales_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'assignee must be an internal user';
  END IF;

  UPDATE public.portal_tickets
     SET assigned_to = _user_id,
         updated_at  = now()
   WHERE id = _ticket_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'ticket not found'; END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.assign_portal_ticket(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_portal_ticket(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_portal_ticket_assignees()
RETURNS TABLE (user_id uuid, name text, email text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (
       has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'support'::app_role)
    OR has_role(v_uid, 'sales'::app_role)
    OR has_role(v_uid, 'sales_manager'::app_role)
    OR has_role(v_uid, 'supply_chain'::app_role)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (p.user_id)
         p.user_id,
         COALESCE(NULLIF(p.name, ''), p.email, 'Unknown')::text,
         p.email::text,
         ur.role::text
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
   WHERE ur.role IN ('supply_chain'::app_role, 'sales_manager'::app_role,
                     'support'::app_role, 'admin'::app_role)
     AND p.is_approved = true
   ORDER BY p.user_id,
            CASE ur.role
              WHEN 'supply_chain'::app_role  THEN 0
              WHEN 'support'::app_role       THEN 1
              WHEN 'sales_manager'::app_role THEN 2
              ELSE 3
            END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_assignees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_assignees() TO authenticated;

DO $do$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'portal-sla-monitor-every-30min',
    'portal-sla-monitor-every-30-min'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(v_name);
      RAISE NOTICE 'unscheduled existing cron job %', v_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron job % not scheduled — nothing to unschedule', v_name;
    END;
  END LOOP;
END $do$;

SELECT cron.schedule(
  'portal-sla-monitor-every-30min',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/portal-sla-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
        'x-cron-secret', public.get_cron_secret()
      ),
      body := '{}'::jsonb
    );
  $$
);