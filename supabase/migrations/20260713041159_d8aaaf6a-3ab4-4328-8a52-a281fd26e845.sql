-- 1. Extend enquiries.status check constraint with 'follow_up'
ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('pending','responded','follow_up','on_hold','moved_to_pipeline','order_won','order_lost'));

-- 2. Guard the two "first response" triggers so they only fire on the FIRST response
CREATE OR REPLACE FUNCTION public.create_supplier_validation_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  supply_chain_user RECORD;
BEGIN
  -- Fire ONLY on the very first response (responded_at was null before)
  IF NEW.status = 'responded'
     AND (OLD.status IS NULL OR OLD.status != 'responded')
     AND OLD.responded_at IS NULL THEN
    SELECT p.user_id, p.name INTO supply_chain_user
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role = 'supply_chain' AND p.is_approved = true
    ORDER BY (
      SELECT COUNT(*) FROM public.tasks t
      WHERE t.assigned_to = p.user_id AND t.status != 'completed'
    ) ASC
    LIMIT 1;

    IF supply_chain_user.user_id IS NOT NULL THEN
      INSERT INTO public.tasks (
        enquiry_id, task_type, title, description,
        assigned_to, assigned_to_name, assigned_role, priority, due_date
      ) VALUES (
        NEW.id, 'supplier_validation'::task_type,
        'Validate supplier for: ' || NEW.product_name,
        'Enquiry responded - verify supplier availability' ||
        E'\nProduct: ' || NEW.product_name ||
        E'\nPricing: ' || COALESCE(NEW.response_pricing, 'N/A') ||
        E'\nLead Time: ' || COALESCE(NEW.response_lead_time, 'N/A'),
        supply_chain_user.user_id, supply_chain_user.name,
        'supply_chain'::app_role, 2, now() + interval '24 hours'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_enquiry_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'responded'
     AND (OLD.status IS NULL OR OLD.status != 'responded')
     AND OLD.responded_at IS NULL
     AND NEW.responded_by IS NOT NULL THEN
    INSERT INTO public.notifications (type, title, message, target_role, user_id, order_id)
    VALUES (
      'enquiry_response',
      '📋 Enquiry Response: ' || NEW.product_name,
      COALESCE(NEW.responded_by_name, 'Supply team') || ' has responded to your enquiry for ' || NEW.product_name
        || ' (Customer: ' || NEW.customer_name || '). Pricing: '
        || COALESCE(NEW.response_pricing, 'N/A') || ', Availability: '
        || COALESCE(NEW.response_availability, 'N/A'),
      'sales', NEW.sales_person_id, NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. New trigger: sync enquiries.status from thread messages
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

  IF sender_role_norm IN ('supply_chain','admin') THEN
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

DROP TRIGGER IF EXISTS trg_sync_enquiry_status_from_thread ON public.enquiry_messages;
CREATE TRIGGER trg_sync_enquiry_status_from_thread
  AFTER INSERT ON public.enquiry_messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_enquiry_status_from_thread();