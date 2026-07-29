CREATE OR REPLACE FUNCTION public.portal_tickets_notify_supply_chain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_title text; v_msg text;
BEGIN
  IF NEW.ticket_type <> 'service_request' THEN RETURN NEW; END IF;
  v_title := 'New service request: ' || NEW.ticket_number;
  v_msg := COALESCE(NEW.related_order_number, 'Portal order') || ' — ' || NEW.subject;
  FOR r IN
    SELECT DISTINCT user_id FROM public.user_roles
     WHERE role IN ('supply_chain','admin','sales_manager')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, portal_ticket_id)
    VALUES (r.user_id, 'portal_service_request', v_title, v_msg, NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;

UPDATE public.notifications n
   SET portal_ticket_id = t.id
  FROM public.portal_tickets t
 WHERE n.type = 'portal_service_request'
   AND n.portal_ticket_id IS NULL
   AND n.title = 'New service request: ' || t.ticket_number;