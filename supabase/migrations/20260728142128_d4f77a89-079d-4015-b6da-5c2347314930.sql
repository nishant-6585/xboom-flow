-- 1. Notification link column
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS portal_ticket_id uuid
    REFERENCES public.portal_tickets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_portal_ticket_id
  ON public.notifications(portal_ticket_id)
  WHERE portal_ticket_id IS NOT NULL;

-- 2. Broaden portal_tickets access: sales owner of the related order
DROP POLICY IF EXISTS "portal_tickets: sales owns related order" ON public.portal_tickets;
CREATE POLICY "portal_tickets: sales owns related order"
  ON public.portal_tickets
  FOR ALL
  TO authenticated
  USING (
    (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
    AND related_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = portal_tickets.related_order_id
        AND o.sales_person_id = auth.uid()
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
    AND related_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = portal_tickets.related_order_id
        AND o.sales_person_id = auth.uid()
    )
  );

-- 3. Same broadening for portal_ticket_messages
DROP POLICY IF EXISTS "portal_messages: sales owns related order" ON public.portal_ticket_messages;
CREATE POLICY "portal_messages: sales owns related order"
  ON public.portal_ticket_messages
  FOR ALL
  TO authenticated
  USING (
    (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.portal_tickets t
      JOIN public.orders o ON o.id = t.related_order_id
      WHERE t.id = portal_ticket_messages.ticket_id
        AND o.sales_person_id = auth.uid()
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'sales_manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.portal_tickets t
      JOIN public.orders o ON o.id = t.related_order_id
      WHERE t.id = portal_ticket_messages.ticket_id
        AND o.sales_person_id = auth.uid()
    )
  );

-- 4. Trigger: notify salesperson (or admins + sales_managers for website orders)
--    when a customer raises a portal ticket linked to an order.
CREATE OR REPLACE FUNCTION public.notify_sales_on_portal_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order         public.orders%ROWTYPE;
  v_order_number  text;
  v_is_website    boolean := false;
  v_title         text;
  v_message       text;
  r               record;
BEGIN
  IF NEW.related_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = NEW.related_order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_order_number := COALESCE(NEW.related_order_number, v_order.order_number, '');
  v_is_website := COALESCE(v_order.source, 'manual') = 'website'
                  OR v_order.sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid;

  v_title   := 'Customer support ticket ' || NEW.ticket_number;
  v_message := COALESCE(NEW.subject, 'New ticket raised');

  IF v_is_website THEN
    -- Fan out to every approved admin + sales_manager
    FOR r IN
      SELECT DISTINCT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('admin'::app_role, 'sales_manager'::app_role)
    LOOP
      INSERT INTO public.notifications
        (user_id, type, title, message, order_id, portal_ticket_id, account_id, target_role)
      VALUES
        (r.user_id, 'portal_ticket_created', v_title, v_message,
         v_order.id, NEW.id, NEW.account_id, NULL);
    END LOOP;
  ELSIF v_order.sales_person_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, order_id, portal_ticket_id, account_id, target_role)
    VALUES
      (v_order.sales_person_id, 'portal_ticket_created', v_title, v_message,
       v_order.id, NEW.id, NEW.account_id, NULL);
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_notify_sales_on_portal_ticket_created ON public.portal_tickets;
CREATE TRIGGER trg_notify_sales_on_portal_ticket_created
  AFTER INSERT ON public.portal_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sales_on_portal_ticket_created();