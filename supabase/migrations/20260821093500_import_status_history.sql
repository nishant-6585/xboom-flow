-- =====================================================
-- Import status history
-- =====================================================
-- `imports.status` was a single mutable column: no record of when a shipment
-- shipped, landed, entered customs or cleared. That makes port dwell time and
-- customs delay unmeasurable and ETA slippage undetectable.

CREATE TABLE IF NOT EXISTS public.import_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID,
  changed_by_name TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_import_status_history_import_id
  ON public.import_status_history(import_id, changed_at DESC);

ALTER TABLE public.import_status_history ENABLE ROW LEVEL SECURITY;

-- History is readable by anyone who can read the parent import, and is written
-- only by the trigger below (which runs as the definer).
CREATE POLICY "Status history follows parent import read access"
  ON public.import_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.imports i WHERE i.id = import_status_history.import_id));

-- No INSERT/UPDATE/DELETE policies: this table is append-only via trigger and
-- must not be editable from the client. An audit trail you can rewrite is not one.

CREATE OR REPLACE FUNCTION public.record_import_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT name INTO actor_name FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.import_status_history (
    import_id, from_status, to_status, changed_by, changed_by_name
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    auth.uid(),
    COALESCE(actor_name, NEW.created_by_name)
  );

  -- Keep the milestone columns consistent with the status the user just set, so
  -- dwell-time reporting does not depend on someone also remembering to fill in
  -- the date field.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('delivered', 'cleared') AND NEW.actual_arrival IS NULL THEN
      NEW.actual_arrival := CURRENT_DATE;
    END IF;
    IF NEW.status = 'cleared' AND NEW.clearance_date IS NULL THEN
      NEW.clearance_date := CURRENT_DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_import_status_history_insert ON public.imports;
CREATE TRIGGER trg_import_status_history_insert
  AFTER INSERT ON public.imports
  FOR EACH ROW EXECUTE FUNCTION public.record_import_status_change();

DROP TRIGGER IF EXISTS trg_import_status_history_update ON public.imports;
CREATE TRIGGER trg_import_status_history_update
  BEFORE UPDATE OF status ON public.imports
  FOR EACH ROW EXECUTE FUNCTION public.record_import_status_change();

-- Seed one opening row per existing import so history is never empty.
INSERT INTO public.import_status_history (import_id, from_status, to_status, changed_at, changed_by, changed_by_name, notes)
SELECT i.id, NULL, i.status, i.created_at, i.created_by, i.created_by_name, 'Backfilled from existing record'
FROM public.imports i
WHERE NOT EXISTS (
  SELECT 1 FROM public.import_status_history h WHERE h.import_id = i.id
);
