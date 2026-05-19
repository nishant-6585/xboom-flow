CREATE OR REPLACE FUNCTION public.deactivate_other_monthly_pulses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS TRUE THEN
    UPDATE public.monthly_pulses
    SET is_active = false
    WHERE id <> NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monthly_pulses_single_active ON public.monthly_pulses;

CREATE TRIGGER trg_monthly_pulses_single_active
AFTER INSERT OR UPDATE OF is_active ON public.monthly_pulses
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_other_monthly_pulses();

-- Backfill: keep only the most recent active pulse active
UPDATE public.monthly_pulses
SET is_active = false
WHERE is_active = true
  AND id <> (
    SELECT id FROM public.monthly_pulses
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  );