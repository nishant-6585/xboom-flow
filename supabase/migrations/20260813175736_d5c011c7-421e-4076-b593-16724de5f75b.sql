CREATE OR REPLACE FUNCTION public.import_meta_leads(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reps uuid[] := ARRAY[
    '7bc60110-5d57-4ae1-bc9f-bf4dd3787a90'::uuid,
    '74930912-193a-4081-a87f-46902ee96c4d'::uuid,
    '457fc2d5-9fc5-439a-938e-5b998549b811'::uuid,
    'a790b58d-8e3d-4333-b6d6-08be631c865d'::uuid,
    '456e91f8-34cc-4f92-a1c1-a092f2bbed39'::uuid
  ];
  v_row jsonb;
  v_email text;
  v_phone text;
  v_name text;
  v_owner text;
  v_channel text;
  v_form text;
  v_stage text;
  v_created text;
  v_message text;
  v_assignee uuid;
  v_assignee_name text;
  v_total int := 0;
  v_inserted int := 0;
  v_skipped int := 0;
  v_duplicates int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can import Meta leads';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    v_total := v_total + 1;
    v_email   := nullif(trim(coalesce(v_row->>'email', '')), '');
    v_phone   := nullif(regexp_replace(coalesce(v_row->>'phone', ''), '[^0-9+]', '', 'g'), '');
    v_name    := nullif(trim(coalesce(v_row->>'name', '')), '');
    v_owner   := nullif(trim(coalesce(v_row->>'owner', '')), '');
    v_channel := nullif(trim(coalesce(v_row->>'channel', '')), '');
    v_form    := nullif(trim(coalesce(v_row->>'form', '')), '');
    v_stage   := nullif(trim(coalesce(v_row->>'stage', '')), '');
    v_created := nullif(trim(coalesce(v_row->>'created_at', '')), '');

    IF v_email IS NULL AND v_phone IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.leads l
      WHERE (v_email IS NOT NULL AND lower(l.email) = lower(v_email))
         OR (v_phone IS NOT NULL AND regexp_replace(coalesce(l.phone,''), '[^0-9+]', '', 'g') = v_phone)
    ) THEN
      v_duplicates := v_duplicates + 1;
      CONTINUE;
    END IF;

    v_assignee := NULL;
    IF v_owner IS NOT NULL THEN
      SELECT p.id INTO v_assignee
        FROM public.profiles p
       WHERE p.id = ANY(v_reps)
         AND lower(p.name) = lower(v_owner)
       LIMIT 1;
      IF v_assignee IS NULL THEN
        SELECT p.id INTO v_assignee
          FROM public.profiles p
         WHERE p.id = ANY(v_reps)
           AND p.name ILIKE '%' || v_owner || '%'
         LIMIT 1;
      END IF;
    END IF;
    IF v_assignee IS NULL THEN
      v_assignee := v_reps[1 + floor(random() * array_length(v_reps, 1))::int];
    END IF;

    SELECT p.name INTO v_assignee_name
      FROM public.profiles p
     WHERE p.id = v_assignee
     LIMIT 1;

    v_message := nullif(
      concat_ws(E'\n',
        nullif(trim(coalesce(v_row->>'notes', '')), ''),
        CASE WHEN v_channel IS NOT NULL THEN 'Channel: ' || v_channel END,
        CASE WHEN v_stage IS NOT NULL THEN 'Stage: ' || v_stage END,
        CASE WHEN v_form  IS NOT NULL THEN 'Form: '  || v_form  END,
        CASE WHEN v_created IS NOT NULL THEN 'Created: ' || v_created END
      ), '');

    INSERT INTO public.leads (
      name, email, phone, source, form_type, subject,
      assigned_to, assigned_to_name, message, submitted_at, payload
    )
    VALUES (
      coalesce(v_name, coalesce(v_email, v_phone)),
      v_email,
      v_phone,
      'Facebook Leads',
      'Facebook Leads',
      v_form,
      v_assignee,
      v_assignee_name,
      v_message,
      v_created,
      v_row
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('total', v_total, 'inserted', v_inserted, 'skipped', v_skipped, 'duplicates', v_duplicates);
END;
$function$;

UPDATE public.leads
   SET form_type = 'Facebook Leads',
       source = 'Facebook Leads'
 WHERE form_type = 'meta-lead-import';