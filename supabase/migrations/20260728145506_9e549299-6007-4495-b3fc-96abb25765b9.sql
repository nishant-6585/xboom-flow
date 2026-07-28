
-- 1) Per-user read marker table
CREATE TABLE IF NOT EXISTS public.portal_ticket_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.portal_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_ticket_reads TO authenticated;
GRANT ALL ON public.portal_ticket_reads TO service_role;

ALTER TABLE public.portal_ticket_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_ticket_reads: user manages own" ON public.portal_ticket_reads;
CREATE POLICY "portal_ticket_reads: user manages own"
  ON public.portal_ticket_reads
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_portal_ticket_reads_user_ticket
  ON public.portal_ticket_reads(user_id, ticket_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_portal_ticket_reads_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_portal_ticket_reads_touch ON public.portal_ticket_reads;
CREATE TRIGGER trg_portal_ticket_reads_touch
  BEFORE UPDATE ON public.portal_ticket_reads
  FOR EACH ROW EXECUTE FUNCTION public.tg_portal_ticket_reads_touch();

-- 2) Extend the staff inbox RPC to include customer_email, item_summary, and per-user unread count
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
    LEFT JOIN order_items_agg      oia ON oia.order_id = t.related_order_id
    LEFT JOIN last_msg              lm ON lm.ticket_id = t.id
    LEFT JOIN unread                u  ON u.ticket_id  = t.id
   WHERE v_is_admin
      OR (v_is_sales AND (
            a.assigned_rep_id = v_uid
         OR EXISTS (SELECT 1 FROM public.orders o2
                     WHERE o2.id = t.related_order_id
                       AND o2.sales_person_id = v_uid)
         ))
      OR (v_is_sc AND t.ticket_type = 'service_request')
   ORDER BY (COALESCE(u.cnt, 0) > 0) DESC,
            COALESCE(lm.created_at, t.created_at) DESC
   LIMIT 300;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_portal_ticket_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_portal_ticket_inbox() TO authenticated;

-- 3) Bulk mark-as-read RPC (per caller)
CREATE OR REPLACE FUNCTION public.mark_portal_tickets_read(_ticket_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _ticket_ids IS NULL OR array_length(_ticket_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  v_allowed := has_role(v_uid, 'admin'::app_role)
            OR has_role(v_uid, 'support'::app_role)
            OR has_role(v_uid, 'sales'::app_role)
            OR has_role(v_uid, 'sales_manager'::app_role)
            OR has_role(v_uid, 'supply_chain'::app_role);
  IF NOT v_allowed THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.portal_ticket_reads (ticket_id, user_id, last_read_at)
  SELECT tid, v_uid, now()
    FROM unnest(_ticket_ids) AS tid
  ON CONFLICT (ticket_id, user_id)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at, updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_portal_tickets_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_portal_tickets_read(uuid[]) TO authenticated;

-- 4) Bulk status change RPC — relies on existing RLS on portal_tickets for row-level checks
CREATE OR REPLACE FUNCTION public.bulk_update_portal_ticket_status(_ticket_ids uuid[], _status text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_count integer := 0;
BEGIN
  IF _ticket_ids IS NULL OR array_length(_ticket_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  IF _status IS NULL OR _status NOT IN ('open','in_progress','awaiting_customer','resolved','closed') THEN
    RAISE EXCEPTION 'invalid status: %', _status;
  END IF;

  UPDATE public.portal_tickets
     SET status = _status,
         updated_at = now()
   WHERE id = ANY(_ticket_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.bulk_update_portal_ticket_status(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_portal_ticket_status(uuid[], text) TO authenticated;
