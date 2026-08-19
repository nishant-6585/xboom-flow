-- ============================================================================
-- Fix: a customer reply from someone who also holds an internal role was silent
-- ============================================================================
-- portal_ticket_messages_notify_staff decided "is this from staff?" by asking
-- whether the sender holds an internal role. That is the wrong question. One
-- person can be both — a staff member testing the customer portal, or an
-- employee who is also a contact on a customer account. For them, every portal
-- reply was classified as a staff reply and the team was never told.
--
-- Observed on TKT-20260819-0020: the customer reply appeared in the thread but
-- produced no in-app, email or Slack alert.
--
-- The authoritative signal is IDENTITY, not role: a portal contact on this
-- ticket's account is the customer side, whatever roles they also hold.
--
-- The same flawed test drove unread_customer_count in list_portal_ticket_inbox,
-- so the "N new from customer" badge could disagree with the alerting. Both now
-- call one shared function, so they cannot drift apart.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_message_is_from_customer(
  _sender_id  uuid,
  _account_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    -- Identity beats role: a portal contact on this account is the customer,
    -- even when the same person also holds admin/supply_chain/etc.
    WHEN EXISTS (
      SELECT 1 FROM public.portal_contacts pc
       WHERE pc.auth_user_id = _sender_id
         AND pc.account_id  = _account_id
    ) THEN true
    -- Otherwise, an internal role means this is a staff reply. The customer is
    -- notified for those separately, by portal-notify.
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _sender_id
         AND ur.role IN ('admin'::app_role, 'support'::app_role, 'sales'::app_role,
                         'sales_manager'::app_role, 'supply_chain'::app_role)
    ) THEN false
    -- Unknown sender — including sender_id NULL, which is how inbound WhatsApp
    -- messages arrive. Treat as customer: over-alerting is recoverable,
    -- silence is the bug this migration exists to fix.
    ELSE true
  END;
$fn$;

COMMENT ON FUNCTION public.portal_message_is_from_customer(uuid, uuid) IS
  'Single definition of "this portal message came from the customer side". '
  'Used by both the reply-notification trigger and the inbox unread count so '
  'the alert and the badge can never disagree.';

-- ---------------------------------------------------------------------------
-- Reply trigger: use identity instead of role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_ticket_messages_notify_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ticket  public.portal_tickets%ROWTYPE;
  v_company text;
  v_title   text;
  v_message text;
  r         record;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;  -- internal notes are non-notifying by design
  END IF;

  SELECT * INTO v_ticket FROM public.portal_tickets t WHERE t.id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Staff replying to the customer: the customer is notified separately by
  -- portal-notify (ticket_message_added). Nothing to do here.
  IF NOT public.portal_message_is_from_customer(NEW.sender_id, v_ticket.account_id) THEN
    RETURN NEW;
  END IF;

  -- Ticket creation seeds the thread with a first message carrying the
  -- description (usePortalTickets.useCreateTicket). That message is the ticket
  -- itself, not a reply — without this guard every new ticket would alert
  -- twice, once per trigger, on every channel.
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_ticket_messages m
     WHERE m.ticket_id = NEW.ticket_id
       AND m.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

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

-- ---------------------------------------------------------------------------
-- Inbox: unread count and "last message by customer" now use the same test,
-- so the amber badge and the alert always agree.
-- ---------------------------------------------------------------------------
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
  WITH last_msg AS (
    SELECT DISTINCT ON (m.ticket_id)
           m.ticket_id, m.created_at, m.sender_id
      FROM public.portal_ticket_messages m
     WHERE m.is_internal = false
     ORDER BY m.ticket_id, m.created_at DESC
  ),
  last_staff AS (
    SELECT m.ticket_id, max(m.created_at) AS last_staff_at
      FROM public.portal_ticket_messages m
      JOIN public.portal_tickets t2 ON t2.id = m.ticket_id
     WHERE m.is_internal = false
       AND NOT public.portal_message_is_from_customer(m.sender_id, t2.account_id)
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
      JOIN public.portal_tickets t2 ON t2.id = m.ticket_id
      LEFT JOIN last_staff ls ON ls.ticket_id = m.ticket_id
      LEFT JOIN my_reads   mr ON mr.ticket_id = m.ticket_id
     WHERE m.is_internal = false
       AND public.portal_message_is_from_customer(m.sender_id, t2.account_id)
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
         (lm.ticket_id IS NOT NULL
           AND public.portal_message_is_from_customer(lm.sender_id, t.account_id)
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