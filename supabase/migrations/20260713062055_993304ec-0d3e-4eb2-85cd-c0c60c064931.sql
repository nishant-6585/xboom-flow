
-- Guard function: block non-admins from mutating approval-related columns on their own queue entries
CREATE OR REPLACE FUNCTION public.ai_action_queue_self_update_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins may change anything
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admins updating their own row cannot touch approval / risk fields
  IF NEW.user_id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_by_name IS DISTINCT FROM OLD.approved_by_name
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.requires_approval IS DISTINCT FROM OLD.requires_approval
       OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
    THEN
      RAISE EXCEPTION 'Only admins can modify approval status of queued AI actions'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Non-admins cannot update someone else's row
  RAISE EXCEPTION 'Not authorized to update this queue entry' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS ai_action_queue_self_update_check ON public.ai_action_queue;
CREATE TRIGGER ai_action_queue_self_update_check
BEFORE UPDATE ON public.ai_action_queue
FOR EACH ROW EXECUTE FUNCTION public.ai_action_queue_self_update_check();
