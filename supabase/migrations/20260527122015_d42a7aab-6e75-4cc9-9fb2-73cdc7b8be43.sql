
-- 1a. Stage enum
DO $$ BEGIN
  CREATE TYPE public.repair_stage AS ENUM (
    'pending_receipt',
    'received',
    'diagnosing',
    'quoted',
    'in_repair',
    'ready_for_pickup',
    'delivered',
    'cancelled',
    'returned_unrepaired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1b. New columns on repairs
ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS repair_stage public.repair_stage NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS item_received_at DATE,
  ADD COLUMN IF NOT EXISTS assigned_technician_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_technician_name TEXT,
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_source_lead_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_repairs_stage ON public.repairs(repair_stage);
CREATE INDEX IF NOT EXISTS idx_repairs_technician ON public.repairs(assigned_technician_id) WHERE assigned_technician_id IS NOT NULL;

-- 1c. Backfill existing rows: best-guess stage based on existing data.
-- Only update rows still on the default 'received' to avoid clobbering later edits.
UPDATE public.repairs
SET repair_stage = CASE
  WHEN date_completed IS NOT NULL AND payment_status = 'paid'        THEN 'delivered'::repair_stage
  WHEN date_completed IS NOT NULL                                    THEN 'ready_for_pickup'::repair_stage
  WHEN total_quote_amount > 0 AND advance_amount > 0                 THEN 'in_repair'::repair_stage
  WHEN total_quote_amount > 0                                        THEN 'quoted'::repair_stage
  ELSE 'received'::repair_stage
END
WHERE repair_stage = 'received';

-- For backfilled rows, item_received_at = date_of_receipt as a reasonable guess.
UPDATE public.repairs
SET item_received_at = date_of_receipt
WHERE item_received_at IS NULL AND repair_stage NOT IN ('pending_receipt', 'cancelled');

-- 1d. Stage history audit trail
CREATE TABLE IF NOT EXISTS public.repair_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  from_stage public.repair_stage,
  to_stage public.repair_stage NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_by_name TEXT,
  notes TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repair_stage_history_repair
  ON public.repair_stage_history(repair_id, changed_at DESC);

GRANT SELECT ON public.repair_stage_history TO authenticated;
GRANT ALL ON public.repair_stage_history TO service_role;

ALTER TABLE public.repair_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can view stage history" ON public.repair_stage_history;
CREATE POLICY "Approved users can view stage history" ON public.repair_stage_history
  FOR SELECT TO authenticated
  USING (public.is_user_approved(auth.uid()));
-- Inserts only happen via the SECURITY DEFINER RPC below; no INSERT policy.

-- 2a. Allowed transitions
CREATE OR REPLACE FUNCTION public.is_valid_repair_stage_transition(
  _from public.repair_stage,
  _to public.repair_stage
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE _from
    WHEN 'pending_receipt'      THEN _to IN ('received', 'cancelled')
    WHEN 'received'             THEN _to IN ('diagnosing', 'cancelled', 'returned_unrepaired')
    WHEN 'diagnosing'           THEN _to IN ('quoted', 'cancelled', 'returned_unrepaired')
    WHEN 'quoted'               THEN _to IN ('in_repair', 'cancelled', 'returned_unrepaired')
    WHEN 'in_repair'            THEN _to IN ('ready_for_pickup', 'cancelled', 'returned_unrepaired')
    WHEN 'ready_for_pickup'     THEN _to IN ('delivered', 'cancelled')
    WHEN 'delivered'            THEN FALSE
    WHEN 'cancelled'            THEN FALSE
    WHEN 'returned_unrepaired'  THEN FALSE
    ELSE FALSE
  END;
$$;

-- 2b. Stage transition RPC
CREATE OR REPLACE FUNCTION public.update_repair_stage(
  _repair_id UUID,
  _new_stage public.repair_stage,
  _notes TEXT DEFAULT NULL,
  _cancellation_reason TEXT DEFAULT NULL
) RETURNS public.repairs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _repair public.repairs%ROWTYPE;
  _from_stage public.repair_stage;
  _user_name TEXT;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supply_chain')
  ) THEN
    RAISE EXCEPTION 'permission_denied: stage updates require admin or supply_chain'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _repair FROM public.repairs WHERE id = _repair_id FOR UPDATE;
  IF _repair.id IS NULL THEN
    RAISE EXCEPTION 'repair_not_found' USING ERRCODE = 'P0002';
  END IF;

  _from_stage := _repair.repair_stage;

  IF _from_stage = _new_stage THEN
    RETURN _repair;
  END IF;

  IF NOT public.is_valid_repair_stage_transition(_from_stage, _new_stage) THEN
    RAISE EXCEPTION 'invalid_transition: cannot move from % to %', _from_stage, _new_stage
      USING ERRCODE = 'P0001';
  END IF;

  SELECT name INTO _user_name FROM public.profiles WHERE user_id = auth.uid();

  -- Side effects per target stage
  IF _new_stage = 'received' AND _repair.item_received_at IS NULL THEN
    UPDATE public.repairs SET item_received_at = CURRENT_DATE WHERE id = _repair_id;
  END IF;

  IF _new_stage = 'quoted' THEN
    UPDATE public.repairs SET quote_sent_at = COALESCE(quote_sent_at, now()) WHERE id = _repair_id;
  END IF;

  IF _new_stage = 'in_repair' THEN
    UPDATE public.repairs SET quote_accepted_at = COALESCE(quote_accepted_at, now()) WHERE id = _repair_id;
  END IF;

  IF _new_stage = 'delivered' AND _repair.date_completed IS NULL THEN
    UPDATE public.repairs SET date_completed = CURRENT_DATE WHERE id = _repair_id;
  END IF;

  IF _new_stage = 'cancelled' THEN
    UPDATE public.repairs
    SET cancelled_at = now(),
        cancelled_by = auth.uid(),
        cancellation_reason = COALESCE(_cancellation_reason, cancellation_reason)
    WHERE id = _repair_id;
  END IF;

  UPDATE public.repairs
  SET repair_stage = _new_stage, updated_at = now()
  WHERE id = _repair_id
  RETURNING * INTO _repair;

  INSERT INTO public.repair_stage_history (
    repair_id, from_stage, to_stage, changed_by, changed_by_name, notes
  ) VALUES (
    _repair_id, _from_stage, _new_stage, auth.uid(), _user_name, _notes
  );

  RETURN _repair;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_repair_stage(uuid, public.repair_stage, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_repair_stage(uuid, public.repair_stage, text, text) TO authenticated;

-- 3. Enhanced website intake: default stage pending_receipt + phone-based dedup
CREATE OR REPLACE FUNCTION public.create_repair_from_drone_intake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand text;
  v_model text;
  v_model_combined text;
  v_issue text;
  v_serial text;
  v_phone text;
  v_existing_repair_id UUID;
  v_rohit_id UUID := '9fea57d6-a27a-4b35-9293-e2151b84f45a'::uuid;
  v_rohit_name text;
BEGIN
  IF NEW.form_type IS DISTINCT FROM 'drone-repair-intake' THEN
    RETURN NEW;
  END IF;

  -- Existing dedup: same source lead already produced a repair
  IF EXISTS (SELECT 1 FROM public.repairs WHERE source_lead_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_brand := COALESCE(NEW.payload->>'drone_brand', '');
  v_model := COALESCE(NEW.payload->>'drone_model', '');
  v_model_combined := NULLIF(TRIM(BOTH ' ' FROM (v_brand || ' ' || v_model)), '');
  v_issue := COALESCE(NEW.payload->>'issues', NEW.message, '');
  v_serial := NULLIF(TRIM(BOTH ' ' FROM COALESCE(NEW.payload->>'serial_number', '')), '');
  v_phone := COALESCE(NEW.phone, '');

  -- NEW: phone (+ optional model/serial) dedup against open repairs in last 60 days
  IF length(v_phone) >= 10 THEN
    SELECT id INTO v_existing_repair_id
    FROM public.repairs
    WHERE contact_no = v_phone
      AND repair_stage NOT IN ('delivered', 'cancelled', 'returned_unrepaired')
      AND created_at > now() - interval '60 days'
      AND (
        v_model_combined IS NULL
        OR lower(model_name) LIKE lower('%' || v_model_combined || '%')
        OR (
          v_serial IS NOT NULL
          AND intake_payload->>'serial_number' = v_serial
        )
      )
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_repair_id IS NOT NULL THEN
      UPDATE public.repairs
      SET duplicate_source_lead_ids = duplicate_source_lead_ids || to_jsonb(NEW.id),
          notes = COALESCE(notes, '')
            || E'\n[Duplicate website submission on '
            || to_char(now(),'YYYY-MM-DD HH24:MI')
            || ' — linked lead #' || NEW.id::text || ']'
      WHERE id = v_existing_repair_id;
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO v_rohit_name FROM public.profiles WHERE user_id = v_rohit_id;

  INSERT INTO public.repairs (
    customer_name, model_name, date_of_receipt, contact_no,
    issue_details, issue_type, components_replaced,
    inspection_charges, repair_cost_charged,
    payment_status, advance_amount, total_quote_amount,
    notes, email, intake_payload, source_lead_id,
    created_by, created_by_name,
    repair_stage, item_received_at
  ) VALUES (
    COALESCE(NEW.name, 'Unknown'),
    COALESCE(v_model_combined, 'Unknown model'),
    COALESCE(NEW.created_at::date, CURRENT_DATE),
    v_phone,
    v_issue,
    'other',
    '[]'::jsonb,
    0, 0,
    'pending', 0, 0,
    'Auto-created from website drone-repair-intake form. Page: ' || COALESCE(NEW.page_url, 'n/a'),
    NEW.email,
    NEW.payload,
    NEW.id,
    v_rohit_id,
    COALESCE(v_rohit_name, 'Rohit'),
    'pending_receipt'::public.repair_stage,
    NULL
  );

  RETURN NEW;
END;
$$;
