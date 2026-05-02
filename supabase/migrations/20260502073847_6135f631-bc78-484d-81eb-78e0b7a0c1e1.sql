CREATE OR REPLACE FUNCTION public.push_form_submission_to_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_form RECORD;
  v_field RECORD;
  v_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_company TEXT;
  v_city TEXT;
  v_product TEXT;
  v_notes TEXT := '';
  v_field_value TEXT;
  v_raw JSONB;
  v_sales_person_id UUID;
  v_sales_person_name TEXT;
  v_form_name_lower TEXT;
  v_label_lower TEXT;
  v_rr_assignees UUID[] := ARRAY[
    'e05f9afe-0160-4956-bb1f-496028386062'::UUID,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::UUID,
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::UUID,
    '457fc2d5-9fc5-439a-938e-5b998549b811'::UUID
  ];
  v_rr_names TEXT[] := ARRAY['Arjav chauhan', 'suman das', 'Narasimha', 'mohammed musthak'];
  v_last_assigned UUID;
  v_rr_index INT := 0;
  v_rohit_id UUID := '9fea57d6-a27a-4b35-9293-e2151b84f45a';
  v_narsimha_id UUID := 'a790b58d-8e3d-4333-b6d6-08be631c865d';
BEGIN
  SELECT id, name INTO v_form FROM public.forms WHERE id = NEW.form_id;

  IF LOWER(v_form.name) LIKE '%job%' OR LOWER(v_form.name) LIKE '%career%'
     OR LOWER(v_form.name) LIKE '%application%' OR LOWER(v_form.name) LIKE '%recruit%'
     OR LOWER(v_form.name) LIKE '%hiring%' OR LOWER(v_form.name) LIKE '%resume%' THEN
    RETURN NEW;
  END IF;

  FOR v_field IN
    SELECT id, label, field_type FROM public.form_fields WHERE form_id = NEW.form_id ORDER BY field_order
  LOOP
    v_raw := NEW.submission_data -> v_field.id::text;
    IF v_raw IS NULL OR jsonb_typeof(v_raw) = 'null' THEN
      CONTINUE;
    END IF;

    IF jsonb_typeof(v_raw) = 'array' THEN
      SELECT string_agg(
               INITCAP(REPLACE(REPLACE(TRIM(BOTH '"' FROM elem::text), '_', ' '), '-', ' ')),
               ', '
             )
      INTO v_field_value
      FROM jsonb_array_elements(v_raw) elem
      WHERE TRIM(BOTH '"' FROM elem::text) <> '';
    ELSE
      v_field_value := NEW.submission_data ->> v_field.id::text;
    END IF;

    IF v_field_value IS NULL OR TRIM(v_field_value) = '' THEN
      CONTINUE;
    END IF;

    v_label_lower := LOWER(v_field.label);

    IF v_field.field_type = 'email' AND v_email IS NULL THEN
      v_email := v_field_value;
    ELSIF v_field.field_type = 'phone' AND v_phone IS NULL THEN
      v_phone := v_field_value;
    ELSIF v_label_lower LIKE '%name%'
          AND v_label_lower NOT LIKE '%company%'
          AND v_label_lower NOT LIKE '%employer%'
          AND v_label_lower NOT LIKE '%organization%'
          AND v_label_lower NOT LIKE '%organisation%'
          AND v_name IS NULL
          AND v_field.field_type NOT IN ('email') THEN
      v_name := v_field_value;
    ELSIF (v_label_lower LIKE '%company%' OR v_label_lower LIKE '%organization%'
           OR v_label_lower LIKE '%organisation%' OR v_label_lower LIKE '%employer%')
          AND v_field.field_type IN ('text', 'textarea')
          AND v_company IS NULL THEN
      v_company := v_field_value;
    ELSIF (v_label_lower LIKE '%city%' OR v_label_lower LIKE '%location%')
          AND v_field.field_type IN ('text', 'textarea')
          AND v_city IS NULL THEN
      v_city := v_field_value;
    ELSIF (v_label_lower LIKE '%product%' OR v_label_lower LIKE '%drone%' OR v_label_lower LIKE '%model%')
          AND v_product IS NULL THEN
      v_product := v_field_value;
    ELSE
      v_notes := v_notes || v_field.label || ': ' || v_field_value || E'\n';
    END IF;
  END LOOP;

  v_form_name_lower := LOWER(COALESCE(v_form.name, ''));

  IF v_form_name_lower LIKE '%contact%' OR v_form_name_lower LIKE '%bulk order%' OR v_form_name_lower LIKE '%drone show%' THEN
    SELECT sales_person_id INTO v_last_assigned
    FROM public.form_leads
    WHERE sales_person_id = ANY(v_rr_assignees)
      AND form_name IN ('Contact us', 'Bulk Order Enquiry Form', 'Drone Show Inquiry Form')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_assigned IS NOT NULL THEN
      FOR i IN 1..array_length(v_rr_assignees, 1) LOOP
        IF v_rr_assignees[i] = v_last_assigned THEN
          v_rr_index := i % array_length(v_rr_assignees, 1);
          EXIT;
        END IF;
      END LOOP;
    END IF;

    v_sales_person_id := v_rr_assignees[v_rr_index + 1];
    v_sales_person_name := v_rr_names[v_rr_index + 1];
  ELSIF v_form_name_lower LIKE '%resell%' OR v_form_name_lower LIKE '%sell%used%' THEN
    v_sales_person_id := v_rohit_id;
    v_sales_person_name := 'Rohit';
  ELSIF v_form_name_lower LIKE '%repair%' THEN
    v_sales_person_id := v_rohit_id;
    v_sales_person_name := 'Rohit';
  ELSIF v_form_name_lower LIKE '%rental%' THEN
    v_sales_person_id := v_rohit_id;
    v_sales_person_name := 'Rohit';
  ELSIF v_form_name_lower LIKE '%pilot%' OR v_form_name_lower LIKE '%training%' THEN
    v_sales_person_id := v_narsimha_id;
    v_sales_person_name := 'Narasimha';
  END IF;

  IF v_name IS NOT NULL OR v_email IS NOT NULL OR v_phone IS NOT NULL THEN
    INSERT INTO public.form_leads (form_id, form_name, submission_id, customer_name, email, phone, company, city, product_name, notes, sales_person_id, sales_person_name)
    VALUES (NEW.form_id, v_form.name, NEW.id, COALESCE(v_name, 'Unknown'), v_email, v_phone, v_company, v_city, v_product, NULLIF(TRIM(v_notes), ''), v_sales_person_id, v_sales_person_name);
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill existing rows
CREATE OR REPLACE FUNCTION public._tmp_prettify_form_value(v TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  arr JSONB;
BEGIN
  IF v IS NULL OR TRIM(v) = '' THEN
    RETURN NULL;
  END IF;
  IF LEFT(TRIM(v), 1) = '[' THEN
    BEGIN
      arr := v::jsonb;
    EXCEPTION WHEN others THEN
      RETURN v;
    END;
    IF jsonb_typeof(arr) = 'array' THEN
      RETURN (
        SELECT string_agg(
                 INITCAP(REPLACE(REPLACE(TRIM(BOTH '"' FROM elem::text), '_', ' '), '-', ' ')),
                 ', '
               )
        FROM jsonb_array_elements(arr) elem
        WHERE TRIM(BOTH '"' FROM elem::text) <> ''
      );
    END IF;
  END IF;
  RETURN v;
END;
$$;

UPDATE public.form_leads
SET product_name = public._tmp_prettify_form_value(product_name)
WHERE product_name LIKE '[%]';

UPDATE public.form_leads
SET company = NULL
WHERE company IN ('["no"]', '["yes"]', '[]')
   OR company ILIKE '["no"%'
   OR company ILIKE '["yes"%';

UPDATE public.form_leads
SET company = public._tmp_prettify_form_value(company)
WHERE company LIKE '[%]';

DROP FUNCTION public._tmp_prettify_form_value(TEXT);