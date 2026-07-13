-- Add is_initial column on enquiry_messages to distinguish the salesperson's
-- opening message (created together with the enquiry itself) from later replies.
ALTER TABLE public.enquiry_messages
  ADD COLUMN IF NOT EXISTS is_initial boolean NOT NULL DEFAULT false;

-- notify_on_enquiry_message: skip notification when this is the initial message,
-- because the New Enquiry alert dialog already surfaces the creation event
-- (a snackbar would be a duplicate).
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enquiry RECORD;
  v_sender_role TEXT;
  v_target_role TEXT;
  v_target_user uuid;
  v_title TEXT;
BEGIN
  -- Initial thread message on enquiry creation: covered by the New Enquiry
  -- alert dialog. Skip notification to avoid duplicates.
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

  v_sender_role := lower(coalesce(NEW.sender_role, ''));

  IF v_sender_role IN ('sales', 'sales_manager') THEN
    v_target_role := 'supply_chain';
    v_target_user := NULL;
  ELSE
    v_target_role := 'sales';
    v_target_user := v_enquiry.sales_person_id;
  END IF;

  v_title := 'New message on enquiry: ' || coalesce(v_enquiry.product_name, 'Enquiry');

  INSERT INTO public.notifications (type, title, message, target_role, user_id, enquiry_id)
  VALUES (
    'enquiry_message',
    v_title,
    coalesce(NEW.sender_name, 'Someone') || ': ' ||
      CASE WHEN length(NEW.message) > 140
           THEN substr(NEW.message, 1, 140) || '…'
           ELSE NEW.message END,
    v_target_role,
    v_target_user,
    v_enquiry.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;