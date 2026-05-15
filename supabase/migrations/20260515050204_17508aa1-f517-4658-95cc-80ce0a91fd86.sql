-- Sequences for RFQ and ticket numbering
CREATE SEQUENCE IF NOT EXISTS public.portal_rfq_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.portal_ticket_number_seq;

-- RFQ numbering
CREATE OR REPLACE FUNCTION public.set_portal_rfq_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rfq_number IS NULL OR NEW.rfq_number = '' THEN
    NEW.rfq_number := 'RFQ-' || to_char(now(), 'YYYYMMDD') || '-' ||
      lpad(nextval('public.portal_rfq_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_rfqs_set_number ON public.portal_rfqs;
CREATE TRIGGER trg_portal_rfqs_set_number
BEFORE INSERT ON public.portal_rfqs
FOR EACH ROW
EXECUTE FUNCTION public.set_portal_rfq_number();

-- Ticket numbering
CREATE OR REPLACE FUNCTION public.set_portal_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || to_char(now(), 'YYYYMMDD') || '-' ||
      lpad(nextval('public.portal_ticket_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_tickets_set_number ON public.portal_tickets;
CREATE TRIGGER trg_portal_tickets_set_number
BEFORE INSERT ON public.portal_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_portal_ticket_number();

-- Auto-snapshot sender_name on ticket messages from portal_contacts (for customers) or profiles (for staff)
CREATE OR REPLACE FUNCTION public.set_portal_message_sender_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.sender_name_snapshot IS NULL OR NEW.sender_name_snapshot = '' THEN
    SELECT pc.full_name INTO v_name FROM public.portal_contacts pc
      WHERE pc.auth_user_id = NEW.sender_id LIMIT 1;
    IF v_name IS NULL THEN
      SELECT COALESCE(p.full_name, p.email) INTO v_name FROM public.profiles p
        WHERE p.id = NEW.sender_id LIMIT 1;
    END IF;
    NEW.sender_name_snapshot := COALESCE(v_name, 'Member');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_messages_set_sender ON public.portal_ticket_messages;
CREATE TRIGGER trg_portal_messages_set_sender
BEFORE INSERT ON public.portal_ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_portal_message_sender_name();

-- Bump portal_tickets.updated_at + first_response_at when a non-internal staff reply lands
CREATE OR REPLACE FUNCTION public.touch_portal_ticket_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.portal_tickets t
     SET updated_at = now(),
         first_response_at = COALESCE(
           t.first_response_at,
           CASE
             WHEN NEW.is_internal = false
                  AND NEW.sender_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM public.portal_contacts pc
                    WHERE pc.auth_user_id = NEW.sender_id
                  )
             THEN now()
             ELSE NULL
           END
         )
   WHERE t.id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_messages_touch_ticket ON public.portal_ticket_messages;
CREATE TRIGGER trg_portal_messages_touch_ticket
AFTER INSERT ON public.portal_ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_portal_ticket_on_message();

-- Storage bucket for customer-uploaded attachments (RFQs, tickets)
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-attachments', 'portal-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: files are stored under <portal_account_id>/<...>
-- Customer (b2b_customer) can read/write only inside their own account folder.
DROP POLICY IF EXISTS "portal-attachments: customer read own" ON storage.objects;
CREATE POLICY "portal-attachments: customer read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'portal-attachments'
  AND has_role(auth.uid(), 'b2b_customer'::app_role)
  AND (storage.foldername(name))[1] = public.get_my_portal_account_id()::text
);

DROP POLICY IF EXISTS "portal-attachments: customer write own" ON storage.objects;
CREATE POLICY "portal-attachments: customer write own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portal-attachments'
  AND has_role(auth.uid(), 'b2b_customer'::app_role)
  AND (storage.foldername(name))[1] = public.get_my_portal_account_id()::text
);

DROP POLICY IF EXISTS "portal-attachments: customer delete own" ON storage.objects;
CREATE POLICY "portal-attachments: customer delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'portal-attachments'
  AND has_role(auth.uid(), 'b2b_customer'::app_role)
  AND (storage.foldername(name))[1] = public.get_my_portal_account_id()::text
);

DROP POLICY IF EXISTS "portal-attachments: internal full" ON storage.objects;
CREATE POLICY "portal-attachments: internal full"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'portal-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'portal-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR has_role(auth.uid(), 'sales'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
  )
);