CREATE OR REPLACE VIEW public.unified_lead_feed AS
 SELECT CASE
            WHEN l.source = 'Facebook Leads'::text THEN 'facebook'::text
            WHEN l.source = 'IndiaMART'::text THEN 'indiamart'::text
            ELSE 'website'::text
        END AS source,
    l.id::text AS source_row_id,
    COALESCE(NULLIF(l.name, ''::text), NULL::text) AS name,
    NULLIF(l.phone, ''::text) AS phone,
    NULLIF(l.email, ''::text) AS email,
    NULLIF(l.company, ''::text) AS company,
    "left"(COALESCE(NULLIF(l.subject, ''::text), NULLIF(l.message, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(l.status, ''::text), 'new'::text) AS status,
    l.assigned_to AS sales_person_id,
    NULLIF(l.assigned_to_name, ''::text) AS sales_person_name,
    l.assigned_to IS NOT NULL AS is_assigned,
    l.created_at,
    'leads'::text AS source_table,
    COALESCE(l.disposition::text, 'untouched'::text) AS disposition,
    l.disposition_reason_code,
    l.disposition_reason_note,
    l.disposition_at,
    l.disposition_by_name,
    NULLIF(l.subject, ''::text) AS product_name
   FROM leads l
UNION ALL
 SELECT 'forms'::text AS source,
    f.id::text AS source_row_id,
    COALESCE(NULLIF(f.customer_name, ''::text), NULL::text) AS name,
    NULLIF(f.phone, ''::text) AS phone,
    NULLIF(f.email, ''::text) AS email,
    COALESCE(NULLIF(f.company, ''::text), NULL::text) AS company,
    "left"(COALESCE(NULLIF(f.product_name, ''::text), NULLIF(f.notes, ''::text), NULLIF(f.form_name, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(f.status, ''::text), 'new'::text) AS status,
    COALESCE(f.sales_person_id, f.assigned_to) AS sales_person_id,
    COALESCE(NULLIF(f.sales_person_name, ''::text), NULLIF(f.assigned_to_name, ''::text)) AS sales_person_name,
    COALESCE(f.sales_person_id, f.assigned_to) IS NOT NULL AS is_assigned,
    f.created_at,
    'form_leads'::text AS source_table,
    COALESCE(f.disposition::text, 'untouched'::text) AS disposition,
    f.disposition_reason_code,
    f.disposition_reason_note,
    f.disposition_at,
    f.disposition_by_name,
    NULLIF(f.product_name, ''::text) AS product_name
   FROM form_leads f
UNION ALL
 SELECT 'google_ads'::text AS source,
    g.id::text AS source_row_id,
    COALESCE(NULLIF(g.customer_name, ''::text), NULL::text) AS name,
    NULLIF(g.phone, ''::text) AS phone,
    NULLIF(g.email, ''::text) AS email,
    COALESCE(NULLIF(g.customer_company, ''::text), NULL::text) AS company,
    "left"(COALESCE(NULLIF(g.product_name, ''::text), NULLIF(g.notes, ''::text), NULLIF(g.campaign_name, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(g.status, ''::text), 'new'::text) AS status,
    g.sales_person_id,
    NULLIF(g.sales_person_name, ''::text) AS sales_person_name,
    g.sales_person_id IS NOT NULL AS is_assigned,
    g.created_at,
    'google_ads_leads'::text AS source_table,
    COALESCE(g.disposition::text, 'untouched'::text) AS disposition,
    g.disposition_reason_code,
    g.disposition_reason_note,
    g.disposition_at,
    g.disposition_by_name,
    NULLIF(g.product_name, ''::text) AS product_name
   FROM google_ads_leads g
UNION ALL
 SELECT 'interakt'::text AS source,
    i.id::text AS source_row_id,
    COALESCE(NULLIF(i.customer_name, ''::text), NULL::text) AS name,
    NULLIF(i.phone_number, ''::text) AS phone,
    NULLIF(i.email, ''::text) AS email,
    COALESCE(NULLIF(i.company, ''::text), NULLIF(i.customer_company, ''::text)) AS company,
    "left"(COALESCE(NULLIF(i.product_name, ''::text), NULLIF(i.notes, ''::text), NULLIF(i.source, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(i.status, ''::text), 'new'::text) AS status,
        CASE
            WHEN i.sales_person_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN i.sales_person_id::uuid
            ELSE NULL::uuid
        END AS sales_person_id,
    NULLIF(i.sales_person_name, ''::text) AS sales_person_name,
    i.sales_person_id IS NOT NULL AND i.sales_person_id <> ''::text AS is_assigned,
    i.created_at,
    'interakt_leads'::text AS source_table,
    COALESCE(i.disposition::text, 'untouched'::text) AS disposition,
    i.disposition_reason_code,
    i.disposition_reason_note,
    i.disposition_at,
    i.disposition_by_name,
    NULLIF(i.product_name, ''::text) AS product_name
   FROM interakt_leads i
UNION ALL
 SELECT 'myoperator'::text AS source,
    c.id::text AS source_row_id,
    COALESCE(NULLIF(c.customer_name, ''::text), NULLIF(c.agent_name, ''::text), NULLIF(c.caller_number, ''::text)) AS name,
    COALESCE(NULLIF(c.caller_number, ''::text), NULLIF(c.full_number, ''::text)) AS phone,
    NULLIF(c.email, ''::text) AS email,
    COALESCE(NULLIF(c.customer_company, ''::text), NULLIF(c.company, ''::text)) AS company,
    "left"(COALESCE(NULLIF(c.requirement, ''::text), NULLIF(c.notes, ''::text), NULLIF(c.product_name, ''::text), NULLIF(c.call_status, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(c.lead_status, ''::text), NULLIF(c.call_status, ''::text), 'new'::text) AS status,
    COALESCE(c.sales_person_id, c.assigned_to) AS sales_person_id,
    COALESCE(NULLIF(c.sales_person_name, ''::text), NULLIF(c.assigned_to_name, ''::text), NULLIF(c.assigned_agent_name, ''::text)) AS sales_person_name,
    COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL AS is_assigned,
    c.created_at,
    'call_logs'::text AS source_table,
    COALESCE(c.disposition::text, 'untouched'::text) AS disposition,
    c.disposition_reason_code,
    c.disposition_reason_note,
    c.disposition_at,
    c.disposition_by_name,
    NULLIF(c.product_name, ''::text) AS product_name
   FROM call_logs c
  WHERE c.lead_source IS DISTINCT FROM 'ElevenLabs'::text
UNION ALL
 SELECT 'elevenlabs'::text AS source,
    c.id::text AS source_row_id,
    COALESCE(NULLIF(c.customer_name, ''::text), NULLIF(c.caller_number, ''::text)) AS name,
    COALESCE(NULLIF(c.caller_number, ''::text), NULLIF(c.full_number, ''::text)) AS phone,
    NULLIF(c.email, ''::text) AS email,
    COALESCE(NULLIF(c.customer_company, ''::text), NULLIF(c.company, ''::text)) AS company,
    "left"(COALESCE(NULLIF(c.requirement, ''::text), NULLIF(c.notes, ''::text), NULLIF(c.raw_transcript, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(c.lead_status, ''::text), NULLIF(c.call_status, ''::text), 'new'::text) AS status,
    COALESCE(c.sales_person_id, c.assigned_to) AS sales_person_id,
    COALESCE(NULLIF(c.sales_person_name, ''::text), NULLIF(c.assigned_to_name, ''::text)) AS sales_person_name,
    COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL AS is_assigned,
    c.created_at,
    'call_logs'::text AS source_table,
    COALESCE(c.disposition::text, 'untouched'::text) AS disposition,
    c.disposition_reason_code,
    c.disposition_reason_note,
    c.disposition_at,
    c.disposition_by_name,
    NULLIF(c.product_name, ''::text) AS product_name
   FROM call_logs c
  WHERE c.lead_source = 'ElevenLabs'::text
UNION ALL
 SELECT 'email'::text AS source,
    e.id::text AS source_row_id,
    COALESCE(NULLIF(e.customer_name, ''::text), NULL::text) AS name,
    NULLIF(e.phone_number, ''::text) AS phone,
    NULLIF(e.email, ''::text) AS email,
    COALESCE(NULLIF(e.customer_company, ''::text), NULL::text) AS company,
    "left"(COALESCE(NULLIF(e.subject, ''::text), NULLIF(e.notes, ''::text), NULLIF(e.body_text, ''::text)), 500) AS subject_or_message,
    COALESCE(NULLIF(e.status, ''::text), 'new'::text) AS status,
    e.sales_person_id,
    NULLIF(e.sales_person_name, ''::text) AS sales_person_name,
    e.sales_person_id IS NOT NULL AS is_assigned,
    e.created_at,
    'email_leads'::text AS source_table,
    COALESCE(e.disposition::text, 'untouched'::text) AS disposition,
    e.disposition_reason_code,
    e.disposition_reason_note,
    e.disposition_at,
    e.disposition_by_name,
    NULLIF(e.product_name, ''::text) AS product_name
   FROM email_leads e;

CREATE OR REPLACE FUNCTION public.import_indiamart_leads(p_rows jsonb)
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
  v_company text;
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
    RAISE EXCEPTION 'Only administrators can import IndiaMART leads';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  LOOP
    v_total := v_total + 1;
    v_email   := nullif(trim(coalesce(v_row->>'email', '')), '');
    v_phone   := nullif(regexp_replace(coalesce(v_row->>'phone', ''), '[^0-9+]', '', 'g'), '');
    v_name    := nullif(trim(coalesce(v_row->>'name', '')), '');
    v_owner   := nullif(trim(coalesce(v_row->>'owner', '')), '');
    v_company := nullif(trim(coalesce(v_row->>'company', '')), '');
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
        CASE WHEN v_form  IS NOT NULL THEN 'Product/Query: '  || v_form  END,
        CASE WHEN v_created IS NOT NULL THEN 'Created: ' || v_created END
      ), '');

    INSERT INTO public.leads (
      name, email, phone, company, source, form_type, subject,
      assigned_to, assigned_to_name, message, submitted_at, payload
    )
    VALUES (
      coalesce(v_name, coalesce(v_email, v_phone)),
      v_email,
      v_phone,
      v_company,
      'IndiaMART',
      'IndiaMART',
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

REVOKE ALL ON FUNCTION public.import_indiamart_leads(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_indiamart_leads(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_indiamart_leads(jsonb) TO service_role;