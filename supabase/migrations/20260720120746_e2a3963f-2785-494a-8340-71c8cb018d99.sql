
-- 1) Column
ALTER TABLE public.enquiry_messages
  ADD COLUMN IF NOT EXISTS is_quote_mirror boolean NOT NULL DEFAULT false;

-- 2) Mirror trigger: when a quote field is updated on public.enquiries,
--    insert one enquiry_messages row that mirrors the structured quote
--    into the discussion thread.
CREATE OR REPLACE FUNCTION public.mirror_enquiry_quote_to_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parts text[] := ARRAY[]::text[];
  v_msg text;
  v_price text;
  v_avail text;
  v_lead text;
  v_notes text;
BEGIN
  -- Recursion guard: never fire from cascaded updates (thread-sync trigger's
  -- own enquiries UPDATE runs at depth > 1).
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Only mirror when a responder is stamped.
  IF NEW.responded_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only mirror when at least one response_* field actually changed.
  IF NEW.response_pricing     IS NOT DISTINCT FROM OLD.response_pricing
     AND NEW.response_availability IS NOT DISTINCT FROM OLD.response_availability
     AND NEW.response_lead_time    IS NOT DISTINCT FROM OLD.response_lead_time
     AND NEW.response_notes        IS NOT DISTINCT FROM OLD.response_notes THEN
    RETURN NEW;
  END IF;

  v_price := btrim(coalesce(NEW.response_pricing, ''));
  v_avail := btrim(coalesce(NEW.response_availability, ''));
  v_lead  := btrim(coalesce(NEW.response_lead_time, ''));
  v_notes := btrim(coalesce(NEW.response_notes, ''));

  IF v_price <> '' THEN v_parts := v_parts || ('Price: ' || v_price); END IF;
  IF v_avail <> '' THEN v_parts := v_parts || ('Availability: ' || v_avail); END IF;
  IF v_lead  <> '' THEN v_parts := v_parts || ('Lead time: ' || v_lead); END IF;

  IF array_length(v_parts, 1) IS NULL AND v_notes = '' THEN
    RETURN NEW;
  END IF;

  v_msg := '📋 Quote updated';
  IF array_length(v_parts, 1) IS NOT NULL THEN
    v_msg := v_msg || ' — ' || array_to_string(v_parts, ' · ');
  END IF;
  IF v_notes <> '' THEN
    v_msg := v_msg || E'\n' || v_notes;
  END IF;

  INSERT INTO public.enquiry_messages
    (enquiry_id, sender_id, sender_name, sender_role, message, is_quote_mirror)
  VALUES
    (NEW.id,
     NEW.responded_by,
     coalesce(NEW.responded_by_name, 'Supply Chain'),
     'supply_chain',
     v_msg,
     true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mirror_enquiry_quote_to_thread ON public.enquiries;
CREATE TRIGGER trg_mirror_enquiry_quote_to_thread
AFTER UPDATE ON public.enquiries
FOR EACH ROW EXECUTE FUNCTION public.mirror_enquiry_quote_to_thread();

-- 3) sync_enquiry_status_from_thread — early-return on quote mirror rows
--    so the mirror never re-triggers status transitions (loop protection).
CREATE OR REPLACE FUNCTION public.sync_enquiry_status_from_thread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  enq RECORD;
  sender_role_norm TEXT;
BEGIN
  IF NEW.is_quote_mirror THEN
    RETURN NEW;
  END IF;

  IF NEW.is_nudge THEN
    RETURN NEW;
  END IF;

  SELECT id, status, responded_at INTO enq
  FROM public.enquiries WHERE id = NEW.enquiry_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF enq.status IN ('on_hold','moved_to_pipeline','order_won','order_lost') THEN
    RETURN NEW;
  END IF;

  sender_role_norm := lower(coalesce(NEW.sender_role, ''));

  IF sender_role_norm = 'supply_chain' THEN
    IF enq.responded_at IS NULL THEN
      UPDATE public.enquiries
        SET status = 'responded',
            responded_at = now(),
            responded_by = NEW.sender_id,
            responded_by_name = NEW.sender_name,
            updated_at = now()
        WHERE id = NEW.enquiry_id;
    ELSIF enq.status = 'follow_up' THEN
      UPDATE public.enquiries
        SET status = 'responded', updated_at = now()
        WHERE id = NEW.enquiry_id;
    END IF;
  ELSIF sender_role_norm IN ('sales','sales_manager') THEN
    IF enq.status = 'responded' THEN
      UPDATE public.enquiries
        SET status = 'follow_up', updated_at = now()
        WHERE id = NEW.enquiry_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) notify_on_enquiry_message — early-return on quote mirror rows so the
--    salesperson only sees the existing enquiry_response notification and
--    not a duplicate "new message" toast.
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enquiry RECORD;
  v_sender_role TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.is_quote_mirror THEN
    RETURN NEW;
  END IF;

  IF NEW.is_initial THEN
    RETURN NEW;
  END IF;

  SELECT id, product_name, customer_name, sales_person_id, sales_person_name, responded_by
    INTO v_enquiry
  FROM public.enquiries
  WHERE id = NEW.enquiry_id;

  IF v_enquiry.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_nudge THEN
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES (
      'enquiry_nudge',
      '👋 Nudge: ' || coalesce(v_enquiry.product_name, 'Enquiry'),
      coalesce(NEW.sender_name, 'A salesperson')
        || ' is waiting for a supply chain reply on '
        || coalesce(v_enquiry.product_name, 'this enquiry')
        || ' (Customer: ' || coalesce(v_enquiry.customer_name, 'Unknown') || ')',
      'supply_chain',
      NULL,
      v_enquiry.id
    );
    RETURN NEW;
  END IF;

  v_sender_role := lower(coalesce(NEW.sender_role, ''));
  v_title := 'New message on enquiry: ' || coalesce(v_enquiry.product_name, 'Enquiry');
  v_body := coalesce(NEW.sender_name, 'Someone') || ': ' ||
    CASE WHEN length(NEW.message) > 140
         THEN substr(NEW.message, 1, 140) || '…'
         ELSE NEW.message END;

  IF v_sender_role IN ('sales', 'sales_manager') THEN
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'supply_chain', NULL, v_enquiry.id);
  ELSIF v_sender_role = 'admin' THEN
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'sales', v_enquiry.sales_person_id, v_enquiry.id);
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'supply_chain', NULL, v_enquiry.id);
  ELSE
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'sales', v_enquiry.sales_person_id, v_enquiry.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;
