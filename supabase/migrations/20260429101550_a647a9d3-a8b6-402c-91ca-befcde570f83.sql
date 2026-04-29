CREATE OR REPLACE FUNCTION public.sync_company_order_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_cnt int;
  v_val numeric;
  v_last timestamptz;
BEGIN
  v_company_id := COALESCE(NEW.company_id, OLD.company_id);
  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(total_sales_amount), 0),
    MAX(COALESCE(order_date, created_at))
  INTO v_cnt, v_val, v_last
  FROM public.orders
  WHERE company_id = v_company_id AND status <> 'cancelled';

  UPDATE public.companies
  SET
    total_orders_count = v_cnt,
    total_order_value = v_val,
    last_order_at = v_last,
    is_recurring = v_cnt >= 2,
    status = CASE WHEN v_cnt > 0 THEN 'customer' ELSE status END,
    updated_at = now()
  WHERE id = v_company_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_company_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
  suffixes text[] := ARRAY[
    'private limited','pvt ltd','pvt limited','pvt. ltd.','pvt.ltd',
    'private ltd','p ltd','pltd',
    'limited','ltd','ltd.',
    'llp','l.l.p',
    'inc','inc.','incorporated',
    'llc','l.l.c',
    'corp','corporation','co','co.','company',
    'gmbh','sa','s.a','srl','s.r.l',
    'enterprises','enterprise','industries','industry',
    'group','holdings','solutions','services','systems',
    'technologies','technology','tech'
  ];
  suf text;
  changed boolean := true;
BEGIN
  IF p_name IS NULL THEN RETURN ''; END IF;
  s := lower(trim(p_name));
  s := regexp_replace(s, '\([^)]*\)', ' ', 'g');
  s := regexp_replace(s, '\[[^\]]*\]', ' ', 'g');
  s := regexp_replace(s, '[.,;:!?''"\\/_\-]+', ' ', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := trim(s);
  WHILE changed LOOP
    changed := false;
    FOREACH suf IN ARRAY suffixes LOOP
      IF s LIKE ('% ' || suf) THEN
        s := trim(substring(s, 1, length(s) - length(suf) - 1));
        changed := true;
      ELSIF s = suf THEN
        s := '';
        changed := true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN trim(regexp_replace(s, '\s+', ' ', 'g'));
END;
$$;

CREATE OR REPLACE FUNCTION public.find_or_create_company(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_id uuid;
  v_admin uuid;
  v_skip text[] := ARRAY['','unknown','n/a','na','none','-','--','null','test','xboom'];
BEGIN
  v_norm := public.normalize_company_name(p_name);
  IF v_norm = '' OR v_norm = ANY(v_skip) OR length(v_norm) < 2 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM public.companies
  WHERE public.normalize_company_name(name) = v_norm
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_admin := COALESCE(auth.uid(), (SELECT user_id FROM public.user_roles WHERE role='admin' ORDER BY created_at LIMIT 1));

  INSERT INTO public.companies (name, status, created_by, created_at, updated_at)
  VALUES (trim(p_name), 'lead', v_admin, now(), now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_link_order_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.customer_company IS NOT NULL THEN
    NEW.company_id := public.find_or_create_company(NEW.customer_company);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_order_company ON public.orders;
CREATE TRIGGER trg_auto_link_order_company
BEFORE INSERT OR UPDATE OF customer_company, company_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_order_company();

ALTER TABLE public.enquiries
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_company_id ON public.enquiries(company_id);

CREATE OR REPLACE FUNCTION public.auto_link_enquiry_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.customer_company IS NOT NULL THEN
    NEW.company_id := public.find_or_create_company(NEW.customer_company);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_enquiry_company ON public.enquiries;
CREATE TRIGGER trg_auto_link_enquiry_company
BEFORE INSERT OR UPDATE OF customer_company, company_id ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_enquiry_company();

DO $$
DECLARE r RECORD; v_id uuid;
BEGIN
  FOR r IN SELECT id, customer_company FROM public.orders WHERE company_id IS NULL AND customer_company IS NOT NULL LOOP
    v_id := public.find_or_create_company(r.customer_company);
    IF v_id IS NOT NULL THEN UPDATE public.orders SET company_id = v_id WHERE id = r.id; END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD; v_id uuid;
BEGIN
  FOR r IN SELECT id, customer_company FROM public.enquiries WHERE company_id IS NULL AND customer_company IS NOT NULL LOOP
    v_id := public.find_or_create_company(r.customer_company);
    IF v_id IS NOT NULL THEN UPDATE public.enquiries SET company_id = v_id WHERE id = r.id; END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT company_id FROM public.orders WHERE company_id IS NOT NULL LOOP
    UPDATE public.companies c
    SET
      total_orders_count = COALESCE(stats.cnt, 0),
      total_order_value = COALESCE(stats.val, 0),
      last_order_at = stats.last_dt,
      is_recurring = COALESCE(stats.cnt, 0) >= 2,
      status = CASE WHEN COALESCE(stats.cnt, 0) > 0 THEN 'customer' ELSE c.status END,
      updated_at = now()
    FROM (
      SELECT
        COUNT(*) AS cnt,
        SUM(COALESCE(total_sales_amount, 0)) AS val,
        MAX(COALESCE(order_date, created_at)) AS last_dt
      FROM public.orders
      WHERE company_id = r.company_id AND status <> 'cancelled'
    ) stats
    WHERE c.id = r.company_id;
  END LOOP;
END $$;