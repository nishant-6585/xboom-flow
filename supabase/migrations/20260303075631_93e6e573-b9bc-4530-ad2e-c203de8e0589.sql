
-- 1. Create new lifecycle status enum
CREATE TYPE public.candidate_lifecycle_status AS ENUM (
  'NEW', 'SCREENING', 'INTERVIEW', 'SELECTED', 'OFFERED', 'JOINED', 'REJECTED', 'DROPPED', 'ON_HOLD'
);

-- 2. Add lifecycle_status column to candidates table
ALTER TABLE public.candidates
ADD COLUMN lifecycle_status public.candidate_lifecycle_status NOT NULL DEFAULT 'NEW';

-- 3. Migrate existing data
UPDATE public.candidates SET lifecycle_status = 'NEW' WHERE status = 'applied';
UPDATE public.candidates SET lifecycle_status = 'SCREENING' WHERE status = 'shortlisted';
UPDATE public.candidates SET lifecycle_status = 'REJECTED' WHERE status = 'rejected';
UPDATE public.candidates SET lifecycle_status = 'JOINED' WHERE status = 'hired';
UPDATE public.candidates SET lifecycle_status = 'REJECTED' WHERE status = 'blacklisted';
-- Map final_status = 'Selected' to SELECTED
UPDATE public.candidates SET lifecycle_status = 'SELECTED' WHERE final_status = 'Selected' AND status NOT IN ('hired', 'rejected', 'blacklisted');

-- 4. Create transition validation trigger
CREATE OR REPLACE FUNCTION public.validate_candidate_lifecycle_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_status text;
  new_status text;
  is_valid boolean := false;
BEGIN
  -- Skip if lifecycle_status hasn't changed
  IF OLD.lifecycle_status = NEW.lifecycle_status THEN
    RETURN NEW;
  END IF;

  old_status := OLD.lifecycle_status::text;
  new_status := NEW.lifecycle_status::text;

  -- Final states: no transitions allowed out
  IF old_status IN ('JOINED', 'REJECTED', 'DROPPED') THEN
    RAISE EXCEPTION 'Invalid status transition: % is a final state and cannot be changed', old_status;
  END IF;

  -- Validate allowed transitions
  is_valid := CASE old_status
    WHEN 'NEW' THEN new_status IN ('SCREENING', 'REJECTED')
    WHEN 'SCREENING' THEN new_status IN ('INTERVIEW', 'ON_HOLD', 'REJECTED')
    WHEN 'INTERVIEW' THEN new_status IN ('SELECTED', 'ON_HOLD', 'REJECTED')
    WHEN 'SELECTED' THEN new_status IN ('OFFERED', 'REJECTED')
    WHEN 'OFFERED' THEN new_status IN ('JOINED', 'DROPPED')
    WHEN 'ON_HOLD' THEN new_status IN ('SCREENING', 'INTERVIEW', 'REJECTED')
    ELSE false
  END;

  IF NOT is_valid THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', old_status, new_status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_candidate_lifecycle
BEFORE UPDATE ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.validate_candidate_lifecycle_transition();

-- 5. Audit logging trigger for lifecycle changes
CREATE OR REPLACE FUNCTION public.audit_candidate_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN
    INSERT INTO public.security_audit_log (
      user_id,
      user_name,
      action,
      target_user_id,
      details,
      user_agent
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'),
      'CANDIDATE_STATUS_CHANGED',
      NULL,
      jsonb_build_object(
        'candidate_id', NEW.id,
        'candidate_name', NEW.full_name,
        'candidate_number', NEW.candidate_number,
        'old_status', OLD.lifecycle_status::text,
        'new_status', NEW.lifecycle_status::text
      ),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_candidate_lifecycle
AFTER UPDATE ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION public.audit_candidate_lifecycle_change();
