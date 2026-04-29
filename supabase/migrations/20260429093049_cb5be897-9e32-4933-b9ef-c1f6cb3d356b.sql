-- Fix find_or_create_company to also set created_by (NOT NULL constraint)
CREATE OR REPLACE FUNCTION public.find_or_create_company(_name text, _owner uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _norm text;
  _fallback uuid;
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN RETURN NULL; END IF;
  _norm := lower(btrim(_name));

  SELECT id INTO _id FROM public.companies 
  WHERE lower(btrim(name)) = _norm LIMIT 1;

  IF _id IS NOT NULL THEN
    -- back-fill account_owner if empty
    IF _owner IS NOT NULL THEN
      UPDATE public.companies 
      SET account_owner_id = _owner 
      WHERE id = _id AND account_owner_id IS NULL;
    END IF;
    RETURN _id;
  END IF;

  -- Need a created_by: use _owner, else any existing company creator, else first profile
  _fallback := _owner;
  IF _fallback IS NULL THEN
    SELECT created_by INTO _fallback FROM public.companies WHERE created_by IS NOT NULL LIMIT 1;
  END IF;
  IF _fallback IS NULL THEN
    SELECT user_id INTO _fallback FROM public.profiles LIMIT 1;
  END IF;
  IF _fallback IS NULL THEN
    RETURN NULL; -- cannot create
  END IF;

  INSERT INTO public.companies (name, status, account_owner_id, created_by)
  VALUES (btrim(_name), 'lead', _owner, _fallback)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- Engagement stage column
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS engagement_stage text DEFAULT 'lead_only',
  ADD COLUMN IF NOT EXISTS engagement_stage_updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.refresh_company_engagement_stage(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _stage text := 'lead_only'; _name text; _norm text;
BEGIN
  SELECT name INTO _name FROM public.companies WHERE id = _company_id;
  IF _name IS NULL THEN RETURN; END IF;
  _norm := lower(btrim(_name));

  IF EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND total_orders_count > 0) THEN
    _stage := 'won';
  ELSIF EXISTS (
    SELECT 1 FROM public.pipeline_orders 
    WHERE (company_id = _company_id OR lower(btrim(customer_company)) = _norm)
      AND COALESCE(status,'') NOT IN ('won','lost','cancelled','converted')
  ) THEN _stage := 'pipeline';
  ELSIF EXISTS (
    SELECT 1 FROM public.prospects 
    WHERE (company_id = _company_id OR lower(btrim(COALESCE(customer_company, company))) = _norm)
      AND COALESCE(status,'') NOT IN ('converted','lost','closed','cancelled')
  ) THEN _stage := 'prospect';
  END IF;

  UPDATE public.companies SET engagement_stage = _stage, engagement_stage_updated_at = now()
  WHERE id = _company_id AND engagement_stage IS DISTINCT FROM _stage;
END; $$;

CREATE OR REPLACE FUNCTION public.refresh_all_company_engagement_stages()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c record; _n integer := 0;
BEGIN
  FOR _c IN SELECT id FROM public.companies LOOP
    PERFORM public.refresh_company_engagement_stage(_c.id);
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_company_stage_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  _cid := COALESCE(NEW.company_id, OLD.company_id);
  IF _cid IS NOT NULL THEN PERFORM public.refresh_company_engagement_stage(_cid); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prospects_refresh_stage ON public.prospects;
CREATE TRIGGER trg_prospects_refresh_stage
AFTER INSERT OR UPDATE OF status, company_id ON public.prospects
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_company_stage_on_change();

DROP TRIGGER IF EXISTS trg_pipeline_refresh_stage ON public.pipeline_orders;
CREATE TRIGGER trg_pipeline_refresh_stage
AFTER INSERT OR UPDATE OF status, company_id ON public.pipeline_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_company_stage_on_change();

-- Backfill from all sources
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT DISTINCT ON (lower(btrim(customer_company))) customer_company, sales_person_id
    FROM public.enquiries WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
  LOOP PERFORM public.find_or_create_company(_r.customer_company, _r.sales_person_id); END LOOP;

  FOR _r IN SELECT DISTINCT ON (lower(btrim(COALESCE(customer_company, company))))
    COALESCE(customer_company, company) AS cname, created_by
    FROM public.prospects WHERE COALESCE(customer_company, company) IS NOT NULL 
      AND btrim(COALESCE(customer_company, company)) <> ''
  LOOP PERFORM public.find_or_create_company(_r.cname, _r.created_by); END LOOP;

  FOR _r IN SELECT DISTINCT ON (lower(btrim(customer_company)))
    customer_company, COALESCE(sales_person_id, created_by) AS owner
    FROM public.pipeline_orders WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
  LOOP PERFORM public.find_or_create_company(_r.customer_company, _r.owner); END LOOP;

  FOR _r IN SELECT DISTINCT ON (lower(btrim(customer_company))) customer_company, sales_person_id
    FROM public.call_logs WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
  LOOP PERFORM public.find_or_create_company(_r.customer_company, _r.sales_person_id); END LOOP;

  FOR _r IN SELECT DISTINCT ON (lower(btrim(COALESCE(customer_company, company))))
    COALESCE(customer_company, company) AS cname,
    CASE WHEN sales_person_id ~ '^[0-9a-f]{8}-' THEN sales_person_id::uuid ELSE NULL END AS owner
    FROM public.interakt_leads WHERE COALESCE(customer_company, company) IS NOT NULL 
      AND btrim(COALESCE(customer_company, company)) <> ''
  LOOP PERFORM public.find_or_create_company(_r.cname, _r.owner); END LOOP;

  FOR _r IN SELECT DISTINCT ON (lower(btrim(customer_company)))
    customer_company, COALESCE(sales_person_id, created_by) AS owner
    FROM public.email_leads WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
  LOOP PERFORM public.find_or_create_company(_r.customer_company, _r.owner); END LOOP;

  FOR _r IN SELECT DISTINCT ON (lower(btrim(customer_company))) customer_company, sales_person_id
    FROM public.google_ads_leads WHERE customer_company IS NOT NULL AND btrim(customer_company) <> ''
  LOOP PERFORM public.find_or_create_company(_r.customer_company, _r.sales_person_id); END LOOP;
END $$;

-- Backfill company_id on prospects/pipeline
UPDATE public.prospects p SET company_id = c.id
FROM public.companies c
WHERE p.company_id IS NULL AND COALESCE(p.customer_company, p.company) IS NOT NULL
  AND lower(btrim(c.name)) = lower(btrim(COALESCE(p.customer_company, p.company)));

UPDATE public.pipeline_orders po SET company_id = c.id
FROM public.companies c
WHERE po.company_id IS NULL AND po.customer_company IS NOT NULL
  AND lower(btrim(c.name)) = lower(btrim(po.customer_company));

SELECT public.refresh_all_company_engagement_stages();

CREATE INDEX IF NOT EXISTS idx_companies_engagement_stage ON public.companies(engagement_stage);