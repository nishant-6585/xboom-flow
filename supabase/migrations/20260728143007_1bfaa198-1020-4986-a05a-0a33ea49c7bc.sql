-- 1. Auto-progress ticket status + first_response_at on first public staff reply
CREATE OR REPLACE FUNCTION public.portal_ticket_msg_status_writeback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_staff boolean := false;
  v_ticket   public.portal_tickets%ROWTYPE;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = NEW.sender_id
       AND ur.role IN ('admin'::app_role, 'support'::app_role,
                        'sales'::app_role, 'sales_manager'::app_role,
                        'supply_chain'::app_role)
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ticket FROM public.portal_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.portal_tickets
     SET status = CASE
                    WHEN status = 'open' THEN 'in_progress'
                    ELSE status
                  END,
         first_response_at = COALESCE(first_response_at, NEW.created_at),
         updated_at = now()
   WHERE id = NEW.ticket_id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_ticket_msg_status_writeback ON public.portal_ticket_messages;
CREATE TRIGGER trg_portal_ticket_msg_status_writeback
  AFTER INSERT ON public.portal_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.portal_ticket_msg_status_writeback();

-- 2. When a ticket is re-opened after resolved/closed, clear resolved_at.
CREATE OR REPLACE FUNCTION public.portal_ticket_status_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status IN ('resolved', 'closed') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_ticket_status_sync ON public.portal_tickets;
CREATE TRIGGER trg_portal_ticket_status_sync
  BEFORE UPDATE OF status ON public.portal_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.portal_ticket_status_sync();

-- 3. Staff inbox RPC (SECURITY DEFINER — replicates ticket RLS in the WHERE clause)
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
  assigned_to uuid,
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
  unread AS (
    SELECT m.ticket_id, count(*)::int AS cnt
      FROM public.portal_ticket_messages m
      LEFT JOIN last_staff ls ON ls.ticket_id = m.ticket_id
     WHERE m.is_internal = false
       AND NOT EXISTS (SELECT 1 FROM staff_users s WHERE s.user_id = m.sender_id)
       AND (ls.last_staff_at IS NULL OR m.created_at > ls.last_staff_at)
     GROUP BY m.ticket_id
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
         t.assigned_to,
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
    LEFT JOIN last_msg lm ON lm.ticket_id = t.id
    LEFT JOIN unread u   ON u.ticket_id  = t.id
   WHERE v_is_admin
      OR (v_is_sales AND (
            a.assigned_rep_id = v_uid
         OR EXISTS (SELECT 1 FROM public.orders o
                     WHERE o.id = t.related_order_id
                       AND o.sales_person_id = v_uid)
         ))
      OR (v_is_sc AND t.ticket_type = 'service_request')
   ORDER BY (COALESCE(u.cnt, 0) > 0) DESC,
            COALESCE(lm.created_at, t.created_at) DESC
   LIMIT 300;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_inbox() TO authenticated;