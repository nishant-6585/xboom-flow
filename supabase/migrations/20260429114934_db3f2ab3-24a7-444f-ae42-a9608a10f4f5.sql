-- 1) Unlink orders pointing at B2C "company" rows (keep the orders themselves)
UPDATE public.orders
SET company_id = NULL
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE name ~ '^[0-9\s\-\+\(\)]+$'
     OR name IS NULL
     OR LENGTH(TRIM(COALESCE(name,''))) < 2
     OR TRIM(name) IN ('-', '--', 'N/A', 'NA', 'None', 'null', 'test')
);

UPDATE public.pipeline_orders
SET company_id = NULL
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE name ~ '^[0-9\s\-\+\(\)]+$'
     OR name IS NULL
     OR LENGTH(TRIM(COALESCE(name,''))) < 2
);

-- 2) Delete contacts attached to those bogus companies
DELETE FROM public.company_contacts
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE name ~ '^[0-9\s\-\+\(\)]+$'
     OR name IS NULL
     OR LENGTH(TRIM(COALESCE(name,''))) < 2
);

-- 3) Delete the bogus company rows themselves
DELETE FROM public.companies
WHERE name ~ '^[0-9\s\-\+\(\)]+$'
   OR name IS NULL
   OR LENGTH(TRIM(COALESCE(name,''))) < 2
   OR TRIM(name) IN ('-', '--', 'N/A', 'NA', 'None', 'null', 'test');

-- 4) DB-level guard: prevent re-introduction
CREATE OR REPLACE FUNCTION public.validate_company_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS NULL OR LENGTH(TRIM(NEW.name)) < 2 THEN
    RAISE EXCEPTION 'Company name must be at least 2 non-numeric characters (got: %)', NEW.name;
  END IF;
  IF NEW.name ~ '^[0-9\s\-\+\(\)]+$' THEN
    RAISE EXCEPTION 'Company name cannot be numeric-only / phone-like (B2C order, not a company): %', NEW.name;
  END IF;
  IF LOWER(TRIM(NEW.name)) IN ('-', '--', 'n/a', 'na', 'none', 'null', 'test', 'unknown') THEN
    RAISE EXCEPTION 'Invalid company name: %', NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_company_name ON public.companies;
CREATE TRIGGER trg_validate_company_name
BEFORE INSERT OR UPDATE OF name
ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.validate_company_name();