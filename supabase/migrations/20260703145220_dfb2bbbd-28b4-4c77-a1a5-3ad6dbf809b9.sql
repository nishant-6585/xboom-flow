
-- === A) Service request tickets ===
ALTER TABLE public.portal_tickets
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS related_order_id uuid,
  ADD COLUMN IF NOT EXISTS related_order_number text,
  ADD COLUMN IF NOT EXISTS related_product_name text;

ALTER TABLE public.portal_tickets
  DROP CONSTRAINT IF EXISTS portal_tickets_ticket_type_check;
ALTER TABLE public.portal_tickets
  ADD CONSTRAINT portal_tickets_ticket_type_check
  CHECK (ticket_type IN ('general','service_request'));

CREATE INDEX IF NOT EXISTS idx_portal_tickets_ticket_type ON public.portal_tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_related_order
  ON public.portal_tickets(related_order_id) WHERE related_order_id IS NOT NULL;

-- Force 12h SLAs for service_request tickets
CREATE OR REPLACE FUNCTION public.portal_tickets_set_sla()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fr_hours INT; res_hours INT;
BEGIN
  IF NEW.ticket_type = 'service_request' THEN
    NEW.sla_first_response_due_at := NEW.created_at + interval '12 hours';
    NEW.sla_resolution_due_at := NEW.created_at + interval '12 hours';
    RETURN NEW;
  END IF;

  IF NEW.sla_first_response_due_at IS NULL THEN
    fr_hours := CASE lower(coalesce(NEW.priority,'normal'))
      WHEN 'critical' THEN 1 WHEN 'high' THEN 4 WHEN 'normal' THEN 8 WHEN 'low' THEN 24 ELSE 8 END;
    NEW.sla_first_response_due_at := NEW.created_at + make_interval(hours => fr_hours);
  END IF;
  IF NEW.sla_resolution_due_at IS NULL THEN
    res_hours := CASE lower(coalesce(NEW.priority,'normal'))
      WHEN 'critical' THEN 8 WHEN 'high' THEN 24 WHEN 'normal' THEN 72 WHEN 'low' THEN 168 ELSE 72 END;
    NEW.sla_resolution_due_at := NEW.created_at + make_interval(hours => res_hours);
  END IF;
  RETURN NEW;
END; $$;

-- Fanout notifications on service_request creation
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
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (r.user_id, 'portal_service_request', v_title, v_msg);
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_portal_tickets_notify_supply_chain ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_notify_supply_chain
  AFTER INSERT ON public.portal_tickets
  FOR EACH ROW EXECUTE FUNCTION public.portal_tickets_notify_supply_chain();

-- === C) Auto-confirm pending orders on KYC submission ===
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_source text;

CREATE OR REPLACE FUNCTION public.auto_confirm_orders_on_kyc_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_emails text[];
BEGIN
  IF NEW.kyc_status = 'pending_verification'
     AND (OLD.kyc_status IS DISTINCT FROM 'pending_verification') THEN
    SELECT array_agg(lower(email)) INTO v_emails
      FROM public.portal_contacts
     WHERE account_id = NEW.id AND is_active = true AND email IS NOT NULL;
    IF v_emails IS NULL OR array_length(v_emails,1) = 0 THEN
      RETURN NEW;
    END IF;
    FOR r IN
      SELECT o.id, o.order_number, o.sales_person_id, o.customer_name
        FROM public.orders o
       WHERE o.confirmation_status = 'pending'
         AND o.customer_email IS NOT NULL
         AND lower(o.customer_email) = ANY(v_emails)
    LOOP
      UPDATE public.orders
         SET confirmation_status = 'confirmed',
             confirmed_at = now(),
             confirmation_source = 'kyc_submission'
       WHERE id = r.id AND confirmation_status = 'pending';

      IF r.sales_person_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, order_id)
        VALUES (r.sales_person_id, 'order_confirmed_by_customer',
          'Order auto-confirmed via KYC: ' || COALESCE(r.order_number, r.id::text),
          COALESCE(r.customer_name,'Customer') || ' submitted KYC — order auto-confirmed.',
          r.id);
      END IF;
      INSERT INTO public.notifications (target_role, type, title, message, order_id)
      VALUES ('admin', 'order_confirmed_by_customer',
        'Order auto-confirmed via KYC: ' || COALESCE(r.order_number, r.id::text),
        COALESCE(r.customer_name,'Customer') || ' submitted KYC — order auto-confirmed.',
        r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_confirm_on_kyc_submission ON public.portal_accounts;
CREATE TRIGGER trg_auto_confirm_on_kyc_submission
  AFTER UPDATE OF kyc_status ON public.portal_accounts
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_orders_on_kyc_submission();
