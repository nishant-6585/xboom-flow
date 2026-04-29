-- Add company_id to pipeline_orders if missing
ALTER TABLE public.pipeline_orders
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_orders_company_id ON public.pipeline_orders(company_id);

-- Helper: find or create a company by normalised name and (optionally) assign owner
CREATE OR REPLACE FUNCTION public.find_or_create_company(_name text, _owner uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _id uuid;
  _norm text;
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN
    RETURN NULL;
  END IF;
  _norm := lower(btrim(_name));

  SELECT id INTO _id FROM companies WHERE lower(btrim(name)) = _norm LIMIT 1;

  IF _id IS NULL THEN
    INSERT INTO companies (name, status, account_owner_id)
    VALUES (btrim(_name), 'lead', _owner)
    RETURNING id INTO _id;
  ELSIF _owner IS NOT NULL THEN
    UPDATE companies
       SET account_owner_id = _owner
     WHERE id = _id AND account_owner_id IS NULL;
  END IF;

  RETURN _id;
END;
$fn$;

-- Enquiries: only auto-create company (table has no company_id column)
CREATE OR REPLACE FUNCTION public.tg_enquiries_sync_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.customer_company IS NOT NULL AND btrim(NEW.customer_company) <> '' THEN
    PERFORM public.find_or_create_company(NEW.customer_company, NEW.sales_person_id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enquiries_sync_company ON public.enquiries;
CREATE TRIGGER trg_enquiries_sync_company
AFTER INSERT OR UPDATE OF customer_company, sales_person_id ON public.enquiries
FOR EACH ROW EXECUTE FUNCTION public.tg_enquiries_sync_company();

-- Prospects: auto-create + link company_id
CREATE OR REPLACE FUNCTION public.tg_prospects_sync_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _name text;
  _id uuid;
BEGIN
  _name := COALESCE(NULLIF(btrim(NEW.customer_company), ''), NULLIF(btrim(NEW.company), ''));
  IF _name IS NULL THEN
    RETURN NEW;
  END IF;

  _id := public.find_or_create_company(_name, NEW.created_by);

  IF NEW.company_id IS NULL AND _id IS NOT NULL THEN
    NEW.company_id := _id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_prospects_sync_company ON public.prospects;
CREATE TRIGGER trg_prospects_sync_company
BEFORE INSERT OR UPDATE OF customer_company, company, company_id, created_by ON public.prospects
FOR EACH ROW EXECUTE FUNCTION public.tg_prospects_sync_company();

-- Pipeline orders: auto-create + link company_id
CREATE OR REPLACE FUNCTION public.tg_pipeline_sync_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _id uuid;
BEGIN
  IF NEW.customer_company IS NULL OR btrim(NEW.customer_company) = '' THEN
    RETURN NEW;
  END IF;

  _id := public.find_or_create_company(NEW.customer_company, COALESCE(NEW.sales_person_id, NEW.created_by));

  IF NEW.company_id IS NULL AND _id IS NOT NULL THEN
    NEW.company_id := _id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pipeline_sync_company ON public.pipeline_orders;
CREATE TRIGGER trg_pipeline_sync_company
BEFORE INSERT OR UPDATE OF customer_company, company_id, sales_person_id, created_by ON public.pipeline_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_pipeline_sync_company();