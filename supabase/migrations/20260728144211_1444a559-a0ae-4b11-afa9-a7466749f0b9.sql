
-- Update trigger to also notify supply_chain users for website order tickets
CREATE OR REPLACE FUNCTION public.notify_sales_on_portal_ticket_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- Fan out to admins, sales managers, and supply chain team
    FOR r IN
      SELECT DISTINCT ur.user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('admin'::app_role, 'sales_manager'::app_role, 'supply_chain'::app_role)
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
$function$;

-- Allow supply_chain to view/manage portal tickets linked to website orders
CREATE POLICY "portal_tickets: supply chain manages website orders"
ON public.portal_tickets
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'supply_chain'::app_role)
  AND related_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = portal_tickets.related_order_id
      AND (COALESCE(o.source, 'manual') = 'website'
           OR o.sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'supply_chain'::app_role)
  AND related_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = portal_tickets.related_order_id
      AND (COALESCE(o.source, 'manual') = 'website'
           OR o.sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid)
  )
);

-- Allow supply_chain to view/post messages on portal tickets linked to website orders
CREATE POLICY "portal_messages: supply chain manages website orders"
ON public.portal_ticket_messages
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'supply_chain'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.portal_tickets t
    JOIN public.orders o ON o.id = t.related_order_id
    WHERE t.id = portal_ticket_messages.ticket_id
      AND (COALESCE(o.source, 'manual') = 'website'
           OR o.sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'supply_chain'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.portal_tickets t
    JOIN public.orders o ON o.id = t.related_order_id
    WHERE t.id = portal_ticket_messages.ticket_id
      AND (COALESCE(o.source, 'manual') = 'website'
           OR o.sales_person_id = 'a8050cc3-7d17-44ac-a083-d8023d505331'::uuid)
  )
);
