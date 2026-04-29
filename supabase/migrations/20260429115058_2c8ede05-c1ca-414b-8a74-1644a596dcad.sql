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
  IF p_name IS NULL THEN RETURN NULL; END IF;

  v_norm := public.normalize_company_name(p_name);

  -- Reject empty / placeholder
  IF v_norm = '' OR v_norm = ANY(v_skip) OR length(v_norm) < 2 THEN
    RETURN NULL;
  END IF;

  -- Reject B2C: numeric-only, phone-like, or any string without letters
  IF p_name ~ '^[0-9\s\-\+\(\)\.]+$' THEN
    RETURN NULL;
  END IF;
  IF p_name !~ '[A-Za-z]' THEN
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

-- Re-clean: unlink + delete again now that the trigger is fixed
UPDATE public.orders
SET company_id = NULL
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE name ~ '^[0-9\s\-\+\(\)\.]+$' OR name !~ '[A-Za-z]'
);

UPDATE public.pipeline_orders
SET company_id = NULL
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE name ~ '^[0-9\s\-\+\(\)\.]+$' OR name !~ '[A-Za-z]'
);

DELETE FROM public.company_contacts
WHERE company_id IN (
  SELECT id FROM public.companies
  WHERE name ~ '^[0-9\s\-\+\(\)\.]+$' OR name !~ '[A-Za-z]'
);

DELETE FROM public.companies
WHERE name ~ '^[0-9\s\-\+\(\)\.]+$' OR name !~ '[A-Za-z]';