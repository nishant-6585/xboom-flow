CREATE OR REPLACE FUNCTION public.notify_on_enquiry_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Suppress when this UPDATE was caused by another trigger (e.g. sync_enquiry_status_from_thread
  -- flipping status='responded' after a thread reply). The 'enquiry_message' notification already
  -- covers awareness — avoid duplicate snackbars for a single supply-chain action.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

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