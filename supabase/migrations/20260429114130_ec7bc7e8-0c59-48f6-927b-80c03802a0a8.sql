INSERT INTO public.company_contacts (company_id, name, phone, email, is_primary)
SELECT DISTINCT ON (po.company_id, regexp_replace(coalesce(po.customer_phone,''), '\D', '', 'g'))
  po.company_id,
  NULLIF(TRIM(po.customer_name), ''),
  NULLIF(TRIM(po.customer_phone), ''),
  NULLIF(TRIM(po.customer_email), ''),
  false
FROM public.pipeline_orders po
WHERE po.company_id IS NOT NULL
  AND COALESCE(po.customer_phone,'') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.company_id = po.company_id
      AND regexp_replace(coalesce(cc.phone,''), '\D', '', 'g')
        = regexp_replace(coalesce(po.customer_phone,''), '\D', '', 'g')
  );

INSERT INTO public.company_contacts (company_id, name, phone, email, is_primary)
SELECT DISTINCT ON (o.company_id, regexp_replace(coalesce(i.customer_phone,''), '\D', '', 'g'))
  o.company_id,
  NULLIF(TRIM(i.customer_name), ''),
  NULLIF(TRIM(i.customer_phone), ''),
  NULLIF(TRIM(i.customer_email), ''),
  false
FROM public.invoices i
JOIN public.orders o ON o.id = i.order_id
WHERE o.company_id IS NOT NULL
  AND COALESCE(i.customer_phone,'') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.company_id = o.company_id
      AND regexp_replace(coalesce(cc.phone,''), '\D', '', 'g')
        = regexp_replace(coalesce(i.customer_phone,''), '\D', '', 'g')
  );

INSERT INTO public.company_contacts (company_id, name, phone, email, is_primary)
SELECT DISTINCT ON (c.id, regexp_replace(coalesce(l.phone,''), '\D', '', 'g'))
  c.id,
  NULLIF(TRIM(l.name), ''),
  NULLIF(TRIM(l.phone), ''),
  NULLIF(TRIM(l.email), ''),
  false
FROM public.companies c
JOIN public.leads l
  ON LOWER(NULLIF(TRIM(l.company),'')) = LOWER(NULLIF(TRIM(c.name),''))
WHERE COALESCE(l.phone,'') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.company_id = c.id
      AND regexp_replace(coalesce(cc.phone,''), '\D', '', 'g')
        = regexp_replace(coalesce(l.phone,''), '\D', '', 'g')
  );

INSERT INTO public.company_contacts (company_id, name, email, is_primary)
SELECT DISTINCT ON (o.company_id, LOWER(TRIM(o.customer_email)))
  o.company_id,
  NULLIF(TRIM(o.customer_name), ''),
  NULLIF(TRIM(o.customer_email), ''),
  false
FROM public.orders o
WHERE o.company_id IS NOT NULL
  AND COALESCE(o.customer_email,'') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.company_id = o.company_id
      AND (
        LOWER(NULLIF(cc.email,'')) = LOWER(TRIM(o.customer_email))
        OR (cc.phone IS NOT NULL AND cc.name IS NOT DISTINCT FROM NULLIF(TRIM(o.customer_name),''))
      )
  );

WITH ranked AS (
  SELECT id, company_id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC, id) AS rn
  FROM public.company_contacts
  WHERE company_id IN (
    SELECT company_id FROM public.company_contacts
    GROUP BY company_id
    HAVING bool_or(is_primary) = false
  )
)
UPDATE public.company_contacts cc
SET is_primary = true
FROM ranked r
WHERE cc.id = r.id AND r.rn = 1;

CREATE OR REPLACE FUNCTION public.sync_pipeline_order_to_company_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_phone_digits text;
BEGIN
  IF NEW.company_id IS NULL OR COALESCE(NEW.customer_phone,'') = '' THEN RETURN NEW; END IF;
  v_phone_digits := regexp_replace(NEW.customer_phone, '\D', '', 'g');
  IF EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.company_id = NEW.company_id
      AND regexp_replace(coalesce(cc.phone,''), '\D', '', 'g') = v_phone_digits
  ) THEN RETURN NEW; END IF;
  INSERT INTO public.company_contacts (company_id, name, phone, email, is_primary)
  VALUES (
    NEW.company_id,
    NULLIF(TRIM(NEW.customer_name),''),
    NULLIF(TRIM(NEW.customer_phone),''),
    NULLIF(TRIM(NEW.customer_email),''),
    NOT EXISTS (SELECT 1 FROM public.company_contacts WHERE company_id = NEW.company_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pipeline_order_contacts ON public.pipeline_orders;
CREATE TRIGGER trg_sync_pipeline_order_contacts
AFTER INSERT OR UPDATE OF customer_phone, customer_name, customer_email, company_id
ON public.pipeline_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_pipeline_order_to_company_contacts();

CREATE OR REPLACE FUNCTION public.sync_invoice_to_company_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company uuid; v_phone_digits text;
BEGIN
  IF COALESCE(NEW.customer_phone,'') = '' THEN RETURN NEW; END IF;
  SELECT company_id INTO v_company FROM public.orders WHERE id = NEW.order_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;
  v_phone_digits := regexp_replace(NEW.customer_phone, '\D', '', 'g');
  IF EXISTS (
    SELECT 1 FROM public.company_contacts cc
    WHERE cc.company_id = v_company
      AND regexp_replace(coalesce(cc.phone,''), '\D', '', 'g') = v_phone_digits
  ) THEN RETURN NEW; END IF;
  INSERT INTO public.company_contacts (company_id, name, phone, email, is_primary)
  VALUES (
    v_company,
    NULLIF(TRIM(NEW.customer_name),''),
    NULLIF(TRIM(NEW.customer_phone),''),
    NULLIF(TRIM(NEW.customer_email),''),
    NOT EXISTS (SELECT 1 FROM public.company_contacts WHERE company_id = v_company)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_contacts ON public.invoices;
CREATE TRIGGER trg_sync_invoice_contacts
AFTER INSERT OR UPDATE OF customer_phone, customer_name, customer_email
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_to_company_contacts();