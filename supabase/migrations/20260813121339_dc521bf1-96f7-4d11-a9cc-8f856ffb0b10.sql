ALTER TABLE public.followups
  ADD COLUMN IF NOT EXISTS mode text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS sequence_no integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'followups_mode_check') THEN
    ALTER TABLE public.followups ADD CONSTRAINT followups_mode_check
      CHECK (mode IS NULL OR mode = ANY (ARRAY['call','whatsapp','email','meeting','site_visit','demo','other']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'followups_outcome_check') THEN
    ALTER TABLE public.followups ADD CONSTRAINT followups_outcome_check
      CHECK (outcome IS NULL OR outcome = ANY (ARRAY['interested','negotiating','awaiting_po','awaiting_payment','no_response','not_interested','other']));
  END IF;
END $$;

-- Backfill sequence numbers for existing history
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY source_type, source_id ORDER BY followup_at, created_at) AS rn
  FROM public.followups
)
UPDATE public.followups f
SET sequence_no = r.rn
FROM ranked r
WHERE f.id = r.id AND (f.sequence_no IS DISTINCT FROM r.rn);

CREATE OR REPLACE FUNCTION public.set_followup_sequence_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sequence_no IS NULL THEN
    SELECT COALESCE(MAX(sequence_no), 0) + 1 INTO NEW.sequence_no
    FROM public.followups
    WHERE source_type = NEW.source_type AND source_id = NEW.source_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_followup_sequence_no ON public.followups;
CREATE TRIGGER trg_set_followup_sequence_no
BEFORE INSERT ON public.followups
FOR EACH ROW EXECUTE FUNCTION public.set_followup_sequence_no();

CREATE OR REPLACE FUNCTION public.get_pipeline_followup_tracker()
RETURNS TABLE (
  pipeline_id uuid,
  customer_name text,
  customer_company text,
  product_name text,
  quantity integer,
  expected_price numeric,
  pipeline_status text,
  sales_person_id uuid,
  sales_person_name text,
  lead_source text,
  phone text,
  email text,
  expected_closure_date date,
  followup_count integer,
  last_followup_at timestamptz,
  last_followup_mode text,
  last_followup_outcome text,
  last_followup_remark text,
  last_followup_by text,
  last_sequence_no integer,
  next_followup_at timestamptz,
  next_followup_id uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.customer_name,
    p.customer_company,
    p.product_name,
    p.quantity,
    p.expected_price,
    p.status,
    p.sales_person_id,
    p.sales_person_name,
    p.lead_source,
    p.customer_phone,
    p.customer_email,
    p.expected_closure_date,
    COALESCE(done.cnt, 0)::int,
    done.last_at,
    done.last_mode,
    done.last_outcome,
    done.last_remark,
    done.last_by,
    COALESCE(done.last_seq, 0)::int,
    nxt.followup_at,
    nxt.id
  FROM public.pipeline_orders p
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt,
           max(f.followup_at) AS last_at,
           (array_agg(f.mode ORDER BY f.followup_at DESC))[1] AS last_mode,
           (array_agg(f.outcome ORDER BY f.followup_at DESC))[1] AS last_outcome,
           (array_agg(f.remark ORDER BY f.followup_at DESC))[1] AS last_remark,
           (array_agg(COALESCE(f.completed_by_name, f.created_by_name) ORDER BY f.followup_at DESC))[1] AS last_by,
           max(f.sequence_no) AS last_seq
    FROM public.followups f
    WHERE f.source_type = 'pipeline' AND f.source_id = p.id AND f.status = 'completed'
  ) done ON true
  LEFT JOIN LATERAL (
    SELECT f.id, f.followup_at
    FROM public.followups f
    WHERE f.source_type = 'pipeline' AND f.source_id = p.id AND f.status = 'pending'
    ORDER BY f.followup_at ASC
    LIMIT 1
  ) nxt ON true;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_followup_tracker() TO authenticated;