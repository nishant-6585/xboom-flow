-- ============================================================================
-- Customer-facing in-app notifications for the portal
-- ============================================================================
-- The portal had no notification surface at all: a customer only learned that
-- staff had replied by opening the ticket and reading the thread, or by
-- spotting the email. This adds an in-app feed the portal can render.
--
-- A separate table rather than reusing public.notifications on purpose. That
-- table is staff-shaped — its RLS grants visibility by internal role, and every
-- INSERT is fanned out to staff web-push. Letting portal contacts read it would
-- risk exposing internal notifications to customers, which is exactly the kind
-- of leak that is hard to notice and serious when it happens.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portal_notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES public.portal_accounts(id) ON DELETE CASCADE,
  -- NULL means "everyone on the account". Set it to scope to one contact.
  contact_id       uuid REFERENCES public.portal_contacts(id) ON DELETE CASCADE,
  type             text NOT NULL,
  title            text NOT NULL,
  message          text NOT NULL,
  portal_ticket_id uuid REFERENCES public.portal_tickets(id) ON DELETE CASCADE,
  order_id         uuid,
  is_read          boolean NOT NULL DEFAULT false,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_account
  ON public.portal_notifications (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_unread
  ON public.portal_notifications (account_id) WHERE NOT is_read;

GRANT SELECT, UPDATE ON public.portal_notifications TO authenticated;
GRANT ALL ON public.portal_notifications TO service_role;

ALTER TABLE public.portal_notifications ENABLE ROW LEVEL SECURITY;

-- Customers see their own account's notifications, and may mark them read.
-- get_my_portal_account_id() is the same SECURITY DEFINER helper every other
-- portal policy uses, so this cannot recurse through portal_contacts RLS.
DROP POLICY IF EXISTS "portal_notifications: contact reads own account"
  ON public.portal_notifications;
CREATE POLICY "portal_notifications: contact reads own account"
  ON public.portal_notifications FOR SELECT TO authenticated
  USING (account_id = public.get_my_portal_account_id());

DROP POLICY IF EXISTS "portal_notifications: contact marks read"
  ON public.portal_notifications;
CREATE POLICY "portal_notifications: contact marks read"
  ON public.portal_notifications FOR UPDATE TO authenticated
  USING (account_id = public.get_my_portal_account_id())
  WITH CHECK (account_id = public.get_my_portal_account_id());

-- Staff read-only visibility, so support can see what the customer was told.
DROP POLICY IF EXISTS "portal_notifications: staff reads"
  ON public.portal_notifications;
CREATE POLICY "portal_notifications: staff reads"
  ON public.portal_notifications FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
  );

-- Writes are trigger/service-role only. No client INSERT policy.

-- ---------------------------------------------------------------------------
-- Staff replied → tell the customer in-app.
--
-- Uses the same portal_message_is_from_customer helper as the staff-facing
-- trigger, inverted. One definition of "which side is this from" means the two
-- directions cannot disagree — a message is either a customer reply that
-- alerts staff, or a staff reply that alerts the customer, never both and
-- never neither.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_ticket_messages_notify_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ticket public.portal_tickets%ROWTYPE;
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;  -- internal notes are never shown to the customer
  END IF;

  SELECT * INTO v_ticket FROM public.portal_tickets t WHERE t.id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Only staff replies notify the customer. A customer's own message must not
  -- notify them about themselves.
  IF public.portal_message_is_from_customer(NEW.sender_id, v_ticket.account_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.portal_notifications
    (account_id, contact_id, type, title, message, portal_ticket_id, order_id, metadata)
  VALUES
    (v_ticket.account_id,
     v_ticket.raised_by_contact_id,
     'ticket_reply',
     'Reply on ' || v_ticket.ticket_number,
     COALESCE(NEW.sender_name_snapshot, 'Support') || ': ' || left(COALESCE(NEW.body, ''), 200),
     v_ticket.id,
     v_ticket.related_order_id,
     jsonb_build_object(
       'ticket_number', v_ticket.ticket_number,
       'subject', v_ticket.subject,
       'message_id', NEW.id
     ));

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_ticket_messages_notify_customer
  ON public.portal_ticket_messages;
CREATE TRIGGER trg_portal_ticket_messages_notify_customer
  AFTER INSERT ON public.portal_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.portal_ticket_messages_notify_customer();

-- ---------------------------------------------------------------------------
-- Ticket status changed → tell the customer in-app too. Resolved/closed is
-- the change they most want to hear about without re-opening the thread.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_tickets_notify_customer_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.portal_notifications
    (account_id, contact_id, type, title, message, portal_ticket_id, order_id, metadata)
  VALUES
    (NEW.account_id,
     NEW.raised_by_contact_id,
     'ticket_status',
     'Ticket ' || NEW.ticket_number || ' is now ' || replace(NEW.status, '_', ' '),
     COALESCE(NEW.subject, ''),
     NEW.id,
     NEW.related_order_id,
     jsonb_build_object(
       'ticket_number', NEW.ticket_number,
       'old_status', OLD.status,
       'new_status', NEW.status
     ));

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_portal_tickets_notify_customer_status
  ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_notify_customer_status
  AFTER UPDATE OF status ON public.portal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.portal_tickets_notify_customer_status();

-- ---------------------------------------------------------------------------
-- Mark-as-read helper, so the portal never needs a direct UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_portal_notifications_read(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_account uuid := public.get_my_portal_account_id();
  v_count integer := 0;
BEGIN
  IF v_account IS NULL THEN RAISE EXCEPTION 'not a portal contact'; END IF;

  UPDATE public.portal_notifications
     SET is_read = true
   WHERE account_id = v_account
     AND (_ids IS NULL OR id = ANY(_ids))
     AND NOT is_read;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_portal_notifications_read(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_portal_notifications_read(uuid[]) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_notifications;
