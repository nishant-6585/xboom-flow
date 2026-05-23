-- 1) Allow sales / sales_manager to view notifications targeted to them
CREATE POLICY "Sales can view sales notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('sales'::app_role, 'sales_manager'::app_role)
  ))
  AND (target_role IS NULL OR target_role IN ('sales', 'sales_manager'))
);

-- 2) Anyone can view notifications addressed to them personally (user_id match)
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id IS NOT NULL AND user_id = auth.uid());

-- 3) Anyone can mark their own notifications as read
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id IS NOT NULL AND user_id = auth.uid());

-- 4) Update enquiry response trigger to also target the specific salesperson
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'responded'
     AND (OLD.status IS NULL OR OLD.status != 'responded')
     AND NEW.responded_by IS NOT NULL THEN
    INSERT INTO public.notifications (type, title, message, target_role, user_id, order_id)
    VALUES (
      'enquiry_response',
      '📋 Enquiry Response: ' || NEW.product_name,
      COALESCE(NEW.responded_by_name, 'Supply team') || ' has responded to your enquiry for ' || NEW.product_name
        || ' (Customer: ' || NEW.customer_name || '). Pricing: '
        || COALESCE(NEW.response_pricing, 'N/A') || ', Availability: '
        || COALESCE(NEW.response_availability, 'N/A'),
      'sales',
      NEW.sales_person_id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Also fire when supply edits an already-responded enquiry's response fields
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_response_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'responded'
     AND OLD.status = 'responded'
     AND NEW.responded_by IS NOT NULL
     AND (
       COALESCE(NEW.response_pricing,'')      IS DISTINCT FROM COALESCE(OLD.response_pricing,'')
       OR COALESCE(NEW.response_availability,'') IS DISTINCT FROM COALESCE(OLD.response_availability,'')
       OR COALESCE(NEW.response_lead_time,'')   IS DISTINCT FROM COALESCE(OLD.response_lead_time,'')
       OR COALESCE(NEW.response_notes,'')       IS DISTINCT FROM COALESCE(OLD.response_notes,'')
     ) THEN
    INSERT INTO public.notifications (type, title, message, target_role, user_id, order_id)
    VALUES (
      'enquiry_response',
      '📋 Enquiry Updated: ' || NEW.product_name,
      COALESCE(NEW.responded_by_name, 'Supply team') || ' updated the response for ' || NEW.product_name
        || ' (Customer: ' || NEW.customer_name || ').',
      'sales',
      NEW.sales_person_id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_notify_enquiry_response_update ON public.enquiries;
CREATE TRIGGER trigger_notify_enquiry_response_update
AFTER UPDATE ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_enquiry_response_update();

-- 6) Update enquiry-message notification to also target the specific counterpart user
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enquiry RECORD;
  v_target_role TEXT;
  v_target_user UUID;
BEGIN
  SELECT product_name, customer_name, sales_person_id, sales_person_name, responded_by
  INTO v_enquiry
  FROM public.enquiries WHERE id = NEW.enquiry_id;

  IF NEW.sender_role = 'sales' THEN
    v_target_role := 'supply_chain';
    v_target_user := v_enquiry.responded_by;  -- may be NULL until first response
  ELSE
    v_target_role := 'sales';
    v_target_user := v_enquiry.sales_person_id;
  END IF;

  INSERT INTO public.notifications (type, title, message, target_role, user_id, order_id)
  VALUES (
    'enquiry_message',
    '💬 New message on: ' || v_enquiry.product_name,
    NEW.sender_name || ' sent a message regarding ' || v_enquiry.product_name
      || ' (Customer: ' || v_enquiry.customer_name || ')',
    v_target_role,
    v_target_user,
    NULL
  );

  RETURN NEW;
END;
$function$;