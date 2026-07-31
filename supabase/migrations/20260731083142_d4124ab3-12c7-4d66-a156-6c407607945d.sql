CREATE OR REPLACE FUNCTION public.import_meta_leads(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_form text;
  v_channel text;
  v_created timestamptz;
  v_reps record;
  v_rep_ids uuid[];
  v_rep_names text[];
  v_idx int;
  v_total int := 0;
  v_inserted int := 0;
  v_dupes int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT (public.is_user_approved(auth.uid())
          AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'))) THEN
    RAISE EXCEPTION 'Not authorized to import leads';
  END IF;

  SELECT array_agg(p.user_id ORDER BY p.name), array_agg(p.name ORDER BY p.name)
    INTO v_rep_ids, v_rep_names
  FROM public.profiles p
  WHERE p.name ~* '(manoj|srishti|musthak|mushtaq|naras|narsi|suman das)';

  IF v_rep_ids IS NULL OR array_length(v_rep_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No sales reps available for assignment';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    v_total := v_total + 1;
    v_name    := nullif(btrim(coalesce(v_row->>'name', '')), '');
    v_email   := nullif(lower(btrim(coalesce(v_row->>'email', ''))), '');
    v_phone   := nullif(btrim(coalesce(v_row->>'phone', '')), '');
    v_form    := nullif(btrim(coalesce(v_row->>'form', '')), '');
    v_channel := nullif(btrim(coalesce(v_row->>'channel', '')), '');

    IF v_email IS NULL AND v_phone IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_created := (v_row->>'created_at')::timestamptz;
    EXCEPTION WHEN others THEN
      v_created := now();
    END;
    IF v_created IS NULL THEN v_created := now(); END IF;

    IF EXISTS (
      SELECT 1 FROM public.leads l
      WHERE (v_email IS NOT NULL AND lower(l.email) = v_email)
         OR (v_phone IS NOT NULL AND l.phone = v_phone)
    ) THEN
      v_dupes := v_dupes + 1;
      CONTINUE;
    END IF;

    v_idx := 1 + floor(random() * array_length(v_rep_ids, 1))::int;

    INSERT INTO public.leads (
      created_at, form_type, name, email, phone, source, status,
      assigned_to, assigned_to_name, payload
    ) VALUES (
      v_created,
      'meta-lead-import',
      coalesce(v_name, v_email, v_phone),
      v_email,
      v_phone,
      'Facebook Leads',
      'new',
      v_rep_ids[v_idx],
      v_rep_names[v_idx],
      jsonb_build_object(
        'import_source', 'meta_excel_upload',
        'fb_form', v_form,
        'channel', v_channel,
        'raw', v_row
      )
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'inserted', v_inserted,
    'duplicates', v_dupes,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_meta_leads(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_meta_leads(jsonb) TO authenticated;