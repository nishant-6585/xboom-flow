-- 1) Link spare_parts_transactions to repairs
ALTER TABLE public.spare_parts_transactions
  ADD COLUMN IF NOT EXISTS repair_id UUID REFERENCES public.repairs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_spare_parts_tx_repair
  ON public.spare_parts_transactions(repair_id)
  WHERE repair_id IS NOT NULL;

-- 2) Helper: deduct stock for inventory-linked components in a repair
CREATE OR REPLACE FUNCTION public._deduct_parts_for_repair(_repair public.repairs)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _comp JSONB;
  _part_id UUID;
  _qty INT;
  _already_logged BOOLEAN;
BEGIN
  IF _repair.components_replaced IS NULL OR jsonb_array_length(_repair.components_replaced) = 0 THEN
    RETURN;
  END IF;

  FOR _comp IN SELECT * FROM jsonb_array_elements(_repair.components_replaced)
  LOOP
    IF (_comp->>'part_id') IS NULL OR (_comp->>'part_id') = '' THEN
      CONTINUE;
    END IF;

    _part_id := (_comp->>'part_id')::uuid;
    _qty := COALESCE((_comp->>'quantity')::int, 1);
    IF _qty <= 0 THEN CONTINUE; END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.spare_parts_transactions
      WHERE repair_id = _repair.id
        AND part_id = _part_id
        AND change_type = 'REMOVE'
        AND reason = 'SALE'
    ) INTO _already_logged;

    IF _already_logged THEN CONTINUE; END IF;

    INSERT INTO public.spare_parts_transactions (
      part_id, change_type, quantity_change, reason, notes, repair_id, created_by
    ) VALUES (
      _part_id, 'REMOVE', _qty, 'SALE',
      'Used in repair ' || COALESCE(_repair.repair_number, _repair.id::text),
      _repair.id, _repair.created_by
    );
  END LOOP;
END;
$$;

-- 3) Triggers on repairs (insert + update of components_replaced)
CREATE OR REPLACE FUNCTION public.trg_repairs_deduct_parts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._deduct_parts_for_repair(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repairs_deduct_parts_insert ON public.repairs;
CREATE TRIGGER trg_repairs_deduct_parts_insert
  AFTER INSERT ON public.repairs
  FOR EACH ROW EXECUTE FUNCTION public.trg_repairs_deduct_parts();

DROP TRIGGER IF EXISTS trg_repairs_deduct_parts_update ON public.repairs;
CREATE TRIGGER trg_repairs_deduct_parts_update
  AFTER UPDATE OF components_replaced ON public.repairs
  FOR EACH ROW
  WHEN (OLD.components_replaced IS DISTINCT FROM NEW.components_replaced)
  EXECUTE FUNCTION public.trg_repairs_deduct_parts();