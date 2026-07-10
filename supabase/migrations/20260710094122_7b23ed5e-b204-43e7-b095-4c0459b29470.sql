
-- 1) Add enquiry_id to notifications for deep-linking
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_enquiry_id
  ON public.notifications(enquiry_id) WHERE enquiry_id IS NOT NULL;

-- 2) Rewrite notify_on_enquiry_message with role-based targeting
CREATE OR REPLACE FUNCTION public.notify_on_enquiry_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enquiry RECORD;
  v_sender_role TEXT;
  v_target_role TEXT;
  v_target_user uuid;
  v_title TEXT;
BEGIN
  SELECT id, product_name, customer_name, sales_person_id, sales_person_name, responded_by
    INTO v_enquiry
  FROM public.enquiries
  WHERE id = NEW.enquiry_id;

  IF v_enquiry.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_sender_role := lower(coalesce(NEW.sender_role, ''));

  -- Sales sender -> broadcast to supply chain team (user_id NULL, role scoped)
  IF v_sender_role IN ('sales', 'sales_manager') THEN
    v_target_role := 'supply_chain';
    v_target_user := NULL;
  ELSE
    -- Supply chain / admin sender -> notify the assigned salesperson
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
  -- Never break the message insert on a notification failure
  RETURN NEW;
END;
$$;

-- Ensure the trigger is present (idempotent re-attach)
DROP TRIGGER IF EXISTS trg_notify_on_enquiry_message ON public.enquiry_messages;
CREATE TRIGGER trg_notify_on_enquiry_message
AFTER INSERT ON public.enquiry_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_enquiry_message();

-- 3) Backfill enquiry_id on existing enquiry_response notifications for deep-linking
UPDATE public.notifications n
SET enquiry_id = e.id
FROM public.enquiries e
WHERE n.enquiry_id IS NULL
  AND n.type IN ('enquiry_response', 'enquiry_message')
  AND n.title ILIKE '%' || e.product_name || '%'
  AND n.created_at >= e.created_at
  AND n.created_at <= e.created_at + interval '30 days';

-- 4) RPC: mark_enquiry_messages_read — participants can flip is_read for others' messages
CREATE OR REPLACE FUNCTION public.mark_enquiry_messages_read(p_enquiry_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated integer := 0;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Participant check: salesperson / responder / admin / sales_manager / supply_chain
  SELECT
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'sales_manager'::app_role)
    OR public.has_role(v_uid, 'supply_chain'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.enquiries e
      WHERE e.id = p_enquiry_id
        AND (e.sales_person_id = v_uid OR e.responded_by = v_uid)
    )
    OR EXISTS (
      SELECT 1 FROM public.enquiry_messages m
      WHERE m.enquiry_id = p_enquiry_id AND m.sender_id = v_uid
    )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not permitted to mark this thread as read' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enquiry_messages
     SET is_read = true, updated_at = now()
   WHERE enquiry_id = p_enquiry_id
     AND is_read = false
     AND sender_id <> v_uid;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_enquiry_messages_read(uuid) TO authenticated;
