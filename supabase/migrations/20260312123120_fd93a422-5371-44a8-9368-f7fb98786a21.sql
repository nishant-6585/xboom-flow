
-- Add persistent sla_breached flag
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sla_breached boolean NOT NULL DEFAULT false;

-- Create trigger to auto-set sla_breached when ticket is updated and SLA is past due
CREATE OR REPLACE FUNCTION public.check_sla_breach_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Once breached, never unset
  IF OLD.sla_breached = true THEN
    NEW.sla_breached := true;
    RETURN NEW;
  END IF;

  -- Check if SLA is breached now (past due and was not resolved/closed before due time)
  IF NEW.sla_due_at IS NOT NULL AND now() > NEW.sla_due_at THEN
    -- If ticket was resolved before SLA due, don't mark as breached
    IF NEW.resolved_at IS NOT NULL AND NEW.resolved_at <= NEW.sla_due_at THEN
      NEW.sla_breached := false;
    ELSE
      NEW.sla_breached := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_sla_breach
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sla_breach_on_update();

-- Also check on insert (for edge cases)
CREATE OR REPLACE FUNCTION public.check_sla_breach_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sla_due_at IS NOT NULL AND now() > NEW.sla_due_at THEN
    NEW.sla_breached := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_sla_breach_insert
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sla_breach_on_insert();

-- Backfill: mark existing tickets that already breached SLA
UPDATE public.tickets
SET sla_breached = true
WHERE sla_due_at IS NOT NULL
  AND sla_due_at < now()
  AND (resolved_at IS NULL OR resolved_at > sla_due_at)
  AND status NOT IN ('closed', 'removed');
