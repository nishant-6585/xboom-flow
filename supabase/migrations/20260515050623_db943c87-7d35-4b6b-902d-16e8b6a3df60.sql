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
      SELECT COALESCE(p.name, p.email) INTO v_name FROM public.profiles p
        WHERE p.user_id = NEW.sender_id LIMIT 1;
    END IF;
    NEW.sender_name_snapshot := COALESCE(v_name, 'Member');
  END IF;
  RETURN NEW;
END;
$$;

-- Same lookup logic to detect "internal staff replied" for first_response_at
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