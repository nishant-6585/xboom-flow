
-- 1. Column
ALTER TABLE public.enquiry_messages
  ADD COLUMN IF NOT EXISTS is_nudge boolean NOT NULL DEFAULT false;

-- 2. sync_enquiry_status_from_thread — skip nudges
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

  IF enq.status IN ('on_hold','moved_to_pipeline','order_won','order_lost') THEN
    RETURN NEW;
  END IF;

  sender_role_norm := lower(coalesce(NEW.sender_role, ''));

  IF sender_role_norm IN ('supply_chain','admin') THEN
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

-- 3. notify_on_enquiry_message — nudge branch
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

-- 4. nudge_enquiry RPC
CREATE OR REPLACE FUNCTION public.nudge_enquiry(p_enquiry_id uuid)
RETURNS public.enquiry_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_enq RECORD;
  v_prof RECORD;
  v_is_sales boolean;
  v_is_manager boolean;
  v_sender_role text;
  v_last_nudge_at timestamptz;
  v_next_allowed timestamptz;
  v_row public.enquiry_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT full_name, is_approved INTO v_prof
    FROM public.profiles WHERE id = v_uid;

  IF v_prof IS NULL OR COALESCE(v_prof.is_approved, false) = false THEN
    RAISE EXCEPTION 'not_approved' USING ERRCODE = '42501';
  END IF;

  v_is_sales   := public.has_role(v_uid, 'sales'::app_role);
  v_is_manager := public.has_role(v_uid, 'sales_manager'::app_role);

  IF NOT (v_is_sales OR v_is_manager) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;

  SELECT id, status, sales_person_id, product_name, customer_name
    INTO v_enq
  FROM public.enquiries WHERE id = p_enquiry_id;

  IF v_enq.id IS NULL THEN
    RAISE EXCEPTION 'enquiry_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_manager AND v_enq.sales_person_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_enquiry_owner' USING ERRCODE = '42501';
  END IF;

  IF v_enq.status NOT IN ('pending','follow_up') THEN
    RAISE EXCEPTION 'not_waiting_on_supply' USING ERRCODE = 'P0001';
  END IF;

  SELECT max(created_at) INTO v_last_nudge_at
    FROM public.enquiry_messages
   WHERE enquiry_id = p_enquiry_id AND is_nudge = true;

  IF v_last_nudge_at IS NOT NULL AND v_last_nudge_at > now() - interval '4 hours' THEN
    v_next_allowed := v_last_nudge_at + interval '4 hours';
    RAISE EXCEPTION 'nudge_cooldown: next allowed at %', to_char(v_next_allowed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      USING ERRCODE = 'P0001';
  END IF;

  v_sender_role := CASE WHEN v_is_manager AND NOT v_is_sales THEN 'sales_manager' ELSE 'sales' END;

  INSERT INTO public.enquiry_messages
    (enquiry_id, sender_id, sender_name, sender_role, message, is_nudge)
  VALUES
    (p_enquiry_id, v_uid, COALESCE(v_prof.full_name, 'Sales'), v_sender_role,
     'Nudged the supply chain team for a response.', true)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nudge_enquiry(uuid) TO authenticated;
