CREATE OR REPLACE FUNCTION public.validate_company_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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