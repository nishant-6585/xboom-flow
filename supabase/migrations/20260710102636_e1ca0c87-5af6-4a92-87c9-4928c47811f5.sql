
-- Ensure trigram extension present
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1) find_duplicate_orders(...) helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_duplicate_orders(
  p_customer_name  text,
  p_customer_phone text,
  p_product_name   text,
  p_product_code   text,
  p_order_date     date,
  p_total          numeric
)
RETURNS TABLE (
  id                 uuid,
  order_number       text,
  source             text,
  external_id        text,
  sales_person_name  text,
  total_sales_amount numeric,
  order_date         date,
  created_at         timestamptz,
  customer_name      text,
  customer_phone     text,
  product_name       text,
  amount_diff_pct    numeric,
  match_reasons      text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      NULLIF(regexp_replace(coalesce(p_customer_phone,''), '\D','', 'g'), '') AS phone_digits,
      lower(trim(coalesce(p_customer_name,'')))  AS name_lc,
      lower(trim(coalesce(p_product_name,'')))   AS prod_lc,
      NULLIF(trim(coalesce(p_product_code,'')),'') AS code_norm,
      COALESCE(p_order_date, CURRENT_DATE)       AS odate,
      COALESCE(p_total, 0)::numeric              AS total_in
  )
  SELECT
    o.id, o.order_number, o.source, o.external_id, o.sales_person_name,
    o.total_sales_amount, o.order_date, o.created_at,
    o.customer_name, o.customer_phone, o.product_name,
    CASE WHEN COALESCE(o.total_sales_amount,0) = 0 AND i.total_in = 0
         THEN 0
         WHEN GREATEST(COALESCE(o.total_sales_amount,0), i.total_in) = 0
         THEN 100
         ELSE round(abs(COALESCE(o.total_sales_amount,0) - i.total_in) * 100.0
                    / GREATEST(COALESCE(o.total_sales_amount,0), i.total_in), 2)
    END AS amount_diff_pct,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN i.phone_digits IS NOT NULL
             AND right(regexp_replace(coalesce(o.customer_phone,''),'\D','','g'),10) = right(i.phone_digits,10)
           THEN 'same phone' END,
      CASE WHEN i.name_lc <> '' AND lower(trim(coalesce(o.customer_name,''))) = i.name_lc
           THEN 'same customer name' END,
      CASE WHEN i.code_norm IS NOT NULL AND o.product_code = i.code_norm
           THEN 'same product code' END,
      CASE WHEN i.prod_lc <> ''
             AND similarity(lower(coalesce(o.product_name,'')), i.prod_lc) >= 0.6
           THEN 'similar product' END,
      CASE WHEN abs(coalesce(o.order_date, o.created_at::date) - i.odate) <= 3
           THEN 'same date (±3d)' END
    ], NULL) AS match_reasons
  FROM public.orders o CROSS JOIN input i
  WHERE o.deleted_at IS NULL
    AND COALESCE(o.status::text,'') <> 'cancelled'
    AND coalesce(o.order_date, o.created_at::date) >= (CURRENT_DATE - INTERVAL '14 days')
    AND (
      (i.phone_digits IS NOT NULL
        AND length(i.phone_digits) >= 7
        AND right(regexp_replace(coalesce(o.customer_phone,''),'\D','','g'),10) = right(i.phone_digits,10))
      OR (i.name_lc <> '' AND lower(trim(coalesce(o.customer_name,''))) = i.name_lc)
    )
    AND (
      (i.prod_lc <> '' AND similarity(lower(coalesce(o.product_name,'')), i.prod_lc) >= 0.6)
      OR (i.code_norm IS NOT NULL AND o.product_code = i.code_norm)
    )
    AND abs(coalesce(o.order_date, o.created_at::date) - i.odate) <= 3;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_orders(text,text,text,text,date,numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.find_duplicate_orders(text,text,text,text,date,numeric) TO authenticated, service_role;

-- ============================================================
-- 2) BEFORE INSERT guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_orders_duplicate_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_match RECORD;
  v_reasons text;
BEGIN
  -- Never block service-role / edge-function inserts
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never block ingest of website/external orders (webhook mirror path)
  IF NEW.source = 'website' OR NEW.external_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Admins bypass
  BEGIN
    v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Hard duplicate check
  SELECT * INTO v_match
  FROM public.find_duplicate_orders(
    NEW.customer_name, NEW.customer_phone, NEW.product_name,
    NEW.product_code, coalesce(NEW.order_date, CURRENT_DATE),
    coalesce(NEW.total_sales_amount, 0)
  ) d
  WHERE d.amount_diff_pct <= 5
    AND 'same date (±3d)' = ANY(d.match_reasons)
    AND (
      'same phone' = ANY(d.match_reasons)
      OR 'same customer name' = ANY(d.match_reasons)
    )
    AND (
      'similar product' = ANY(d.match_reasons)
      OR 'same product code' = ANY(d.match_reasons)
    )
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_reasons := array_to_string(v_match.match_reasons, ', ');
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'DUPLICATE_ORDER: matches %s (%s, created %s, salesperson %s). If this is a website order you handled, use the Transfer/Attribution request flow instead of creating a new order. [%s]',
        v_match.order_number,
        coalesce(v_match.source,'manual'),
        to_char(v_match.created_at,'YYYY-MM-DD'),
        coalesce(v_match.sales_person_name,'unknown'),
        v_reasons
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_orders_duplicate_creation ON public.orders;
CREATE TRIGGER guard_orders_duplicate_creation
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_orders_duplicate_creation();

-- ============================================================
-- 3) order_duplicate_candidates review table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_duplicate_candidates (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  manual_order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  match_reasons            text[] NOT NULL DEFAULT '{}',
  amount_diff              numeric,
  payment_records_on_manual integer NOT NULL DEFAULT 0,
  status                   text NOT NULL DEFAULT 'pending_review'
                             CHECK (status IN ('pending_review','approved','rejected','merged')),
  decided_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at               timestamptz,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (website_order_id, manual_order_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_duplicate_candidates TO authenticated;
GRANT ALL ON public.order_duplicate_candidates TO service_role;

ALTER TABLE public.order_duplicate_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "duplicate_candidates_admin_select"
  ON public.order_duplicate_candidates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "duplicate_candidates_admin_write"
  ON public.order_duplicate_candidates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_order_duplicate_candidates_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_odc_updated_at ON public.order_duplicate_candidates;
CREATE TRIGGER trg_odc_updated_at BEFORE UPDATE ON public.order_duplicate_candidates
FOR EACH ROW EXECUTE FUNCTION public.tg_order_duplicate_candidates_touch();

CREATE INDEX IF NOT EXISTS idx_odc_status ON public.order_duplicate_candidates(status);
CREATE INDEX IF NOT EXISTS idx_odc_website ON public.order_duplicate_candidates(website_order_id);
CREATE INDEX IF NOT EXISTS idx_odc_manual  ON public.order_duplicate_candidates(manual_order_id);

-- ============================================================
-- 4) Populate existing duplicate pairs
-- ============================================================
INSERT INTO public.order_duplicate_candidates
  (website_order_id, manual_order_id, match_reasons, amount_diff, payment_records_on_manual)
SELECT
  w.id, m.id,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN right(regexp_replace(coalesce(w.customer_phone,''),'\D','','g'),10)
           = right(regexp_replace(coalesce(m.customer_phone,''),'\D','','g'),10)
         AND length(regexp_replace(coalesce(w.customer_phone,''),'\D','','g')) >= 7
      THEN 'same phone' END,
    CASE WHEN lower(trim(coalesce(w.customer_name,''))) = lower(trim(coalesce(m.customer_name,'')))
      THEN 'same customer name' END,
    CASE WHEN w.product_code IS NOT NULL AND w.product_code = m.product_code
      THEN 'same product code' END,
    CASE WHEN similarity(lower(coalesce(w.product_name,'')), lower(coalesce(m.product_name,''))) >= 0.6
      THEN 'similar product' END,
    CASE WHEN abs(coalesce(w.order_date, w.created_at::date) - coalesce(m.order_date, m.created_at::date)) <= 3
      THEN 'same date (±3d)' END
  ], NULL),
  abs(coalesce(w.total_sales_amount,0) - coalesce(m.total_sales_amount,0)),
  (SELECT count(*)::int FROM public.payment_records pr WHERE pr.order_id = m.id)
FROM public.orders w
JOIN public.orders m ON
  m.id <> w.id
  AND m.deleted_at IS NULL
  AND (m.source IS NULL OR m.source <> 'website')
  AND m.external_id IS NULL
  AND COALESCE(m.status::text,'') <> 'cancelled'
  AND abs(coalesce(w.order_date, w.created_at::date) - coalesce(m.order_date, m.created_at::date)) <= 3
  AND (
    (length(regexp_replace(coalesce(w.customer_phone,''),'\D','','g')) >= 7
     AND right(regexp_replace(coalesce(w.customer_phone,''),'\D','','g'),10)
       = right(regexp_replace(coalesce(m.customer_phone,''),'\D','','g'),10))
    OR lower(trim(coalesce(w.customer_name,''))) = lower(trim(coalesce(m.customer_name,'')))
  )
  AND (
    similarity(lower(coalesce(w.product_name,'')), lower(coalesce(m.product_name,''))) >= 0.6
    OR (w.product_code IS NOT NULL AND w.product_code = m.product_code)
  )
WHERE w.source = 'website'
  AND w.external_id IS NOT NULL
  AND w.deleted_at IS NULL
  AND COALESCE(w.status::text,'') <> 'cancelled'
ON CONFLICT (website_order_id, manual_order_id) DO NOTHING;
