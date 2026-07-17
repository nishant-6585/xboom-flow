-- Admin messages in the enquiry thread behave as a moderator, not a responder:
--   1. They NEVER auto-stamp the enquiry as responded — that transition is
--      reserved for actual supply_chain replies (or the Quote Details form).
--   2. They notify BOTH sides: the assigned salesperson (targeted) AND the
--      supply_chain team (role broadcast), so neither side misses an admin
--      question dropped into the thread.

-- 1. sync_enquiry_status_from_thread — only supply_chain replies drive the
--    pending/follow_up -> responded transition now.
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
  -- Nudges NEVER mutate enquiry status.
  IF NEW.is_nudge THEN
    RETURN NEW;
  END IF;

  SELECT id, status, responded_at INTO enq
  FROM public.enquiries WHERE id = NEW.enquiry_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Sales lifecycle statuses win — never auto-mutate
  IF enq.status IN ('on_hold','moved_to_pipeline','order_won','order_lost') THEN
    RETURN NEW;
  END IF;

  sender_role_norm := lower(coalesce(NEW.sender_role, ''));

  -- Admin messages are moderation, not a supply response: no status change.
  IF sender_role_norm = 'supply_chain' THEN
    IF enq.responded_at IS NULL THEN
      -- First response via thread: stamp first-response metadata + move to responded
      UPDATE public.enquiries
        SET status = 'responded',
            responded_at = now(),
            responded_by = NEW.sender_id,
            responded_by_name = NEW.sender_name,
            updated_at = now()
        WHERE id = NEW.enquiry_id;
    ELSIF enq.status = 'follow_up' THEN
      -- Subsequent reply resolving a follow-up: flip status only, preserve SLA metadata
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

-- 2. notify_on_enquiry_message — admin sender notifies both sides.
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

  -- Nudge branch: broadcast to supply_chain, unique title/message, no user targeting.
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
    -- Sales wrote: notify the supply chain team (role broadcast).
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'supply_chain', NULL, v_enquiry.id);
  ELSIF v_sender_role = 'admin' THEN
    -- Admin wrote: notify BOTH the salesperson and the supply chain team.
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'sales', v_enquiry.sales_person_id, v_enquiry.id);
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'supply_chain', NULL, v_enquiry.id);
  ELSE
    -- Supply chain wrote: notify the assigned salesperson (targeted).
    INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
    VALUES ('enquiry_message', v_title, v_body, 'sales', v_enquiry.sales_person_id, v_enquiry.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;
