CREATE OR REPLACE VIEW public.unified_lead_feed
WITH (security_invoker = on) AS
SELECT * FROM (
  SELECT
    CASE
      WHEN l.source = 'Facebook Leads' THEN 'facebook'
      WHEN l.source = 'IndiaMART' THEN 'indiamart'
      WHEN l.source = 'walk_in' THEN 'walk_in'
      ELSE 'website'
    END AS source,
    l.id::text AS source_row_id,
    NULLIF(l.name, '') AS name,
    NULLIF(l.phone, '') AS phone,
    NULLIF(l.email, '') AS email,
    NULLIF(l.company, '') AS company,
    left(COALESCE(NULLIF(l.subject, ''), NULLIF(l.message, '')), 500) AS subject_or_message,
    COALESCE(NULLIF(l.status, ''), 'new') AS status,
    l.assigned_to AS sales_person_id,
    NULLIF(l.assigned_to_name, '') AS sales_person_name,
    l.assigned_to IS NOT NULL AS is_assigned,
    l.created_at,
    'leads'::text AS source_table,
    COALESCE(l.disposition::text, 'untouched') AS disposition,
    l.disposition_reason_code,
    l.disposition_reason_note,
    l.disposition_at,
    l.disposition_by_name,
    NULLIF(l.subject, '') AS product_name
  FROM public.leads l
  UNION ALL
  SELECT 'forms', f.id::text,
    NULLIF(f.customer_name, ''), NULLIF(f.phone, ''), NULLIF(f.email, ''), NULLIF(f.company, ''),
    left(COALESCE(NULLIF(f.product_name, ''), NULLIF(f.notes, ''), NULLIF(f.form_name, '')), 500),
    COALESCE(NULLIF(f.status, ''), 'new'),
    COALESCE(f.sales_person_id, f.assigned_to),
    COALESCE(NULLIF(f.sales_person_name, ''), NULLIF(f.assigned_to_name, '')),
    COALESCE(f.sales_person_id, f.assigned_to) IS NOT NULL,
    f.created_at, 'form_leads',
    COALESCE(f.disposition::text, 'untouched'), f.disposition_reason_code, f.disposition_reason_note,
    f.disposition_at, f.disposition_by_name, NULLIF(f.product_name, '')
  FROM public.form_leads f
  UNION ALL
  SELECT 'google_ads', g.id::text,
    NULLIF(g.customer_name, ''), NULLIF(g.phone, ''), NULLIF(g.email, ''), NULLIF(g.customer_company, ''),
    left(COALESCE(NULLIF(g.product_name, ''), NULLIF(g.notes, ''), NULLIF(g.campaign_name, '')), 500),
    COALESCE(NULLIF(g.status, ''), 'new'),
    g.sales_person_id, NULLIF(g.sales_person_name, ''), g.sales_person_id IS NOT NULL,
    g.created_at, 'google_ads_leads',
    COALESCE(g.disposition::text, 'untouched'), g.disposition_reason_code, g.disposition_reason_note,
    g.disposition_at, g.disposition_by_name, NULLIF(g.product_name, '')
  FROM public.google_ads_leads g
  UNION ALL
  SELECT 'interakt', i.id::text,
    NULLIF(i.customer_name, ''), NULLIF(i.phone_number, ''), NULLIF(i.email, ''),
    COALESCE(NULLIF(i.company, ''), NULLIF(i.customer_company, '')),
    left(COALESCE(NULLIF(i.product_name, ''), NULLIF(i.notes, ''), NULLIF(i.source, '')), 500),
    COALESCE(NULLIF(i.status, ''), 'new'),
    CASE WHEN i.sales_person_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN i.sales_person_id::uuid ELSE NULL::uuid END,
    NULLIF(i.sales_person_name, ''), i.sales_person_id IS NOT NULL AND i.sales_person_id <> '',
    i.created_at, 'interakt_leads',
    COALESCE(i.disposition::text, 'untouched'), i.disposition_reason_code, i.disposition_reason_note,
    i.disposition_at, i.disposition_by_name, NULLIF(i.product_name, '')
  FROM public.interakt_leads i
  UNION ALL
  SELECT 'myoperator', c.id::text,
    COALESCE(NULLIF(c.customer_name, ''), NULLIF(c.agent_name, ''), NULLIF(c.caller_number, '')),
    COALESCE(NULLIF(c.caller_number, ''), NULLIF(c.full_number, '')),
    NULLIF(c.email, ''),
    COALESCE(NULLIF(c.customer_company, ''), NULLIF(c.company, '')),
    left(COALESCE(NULLIF(c.requirement, ''), NULLIF(c.notes, ''), NULLIF(c.product_name, ''), NULLIF(c.call_status, '')), 500),
    COALESCE(NULLIF(c.lead_status, ''), NULLIF(c.call_status, ''), 'new'),
    COALESCE(c.sales_person_id, c.assigned_to),
    COALESCE(NULLIF(c.sales_person_name, ''), NULLIF(c.assigned_to_name, ''), NULLIF(c.assigned_agent_name, '')),
    COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL,
    c.created_at, 'call_logs',
    COALESCE(c.disposition::text, 'untouched'), c.disposition_reason_code, c.disposition_reason_note,
    c.disposition_at, c.disposition_by_name, NULLIF(c.product_name, '')
  FROM public.call_logs c
  WHERE c.lead_source IS DISTINCT FROM 'ElevenLabs'
  UNION ALL
  SELECT 'elevenlabs', c.id::text,
    COALESCE(NULLIF(c.customer_name, ''), NULLIF(c.caller_number, '')),
    COALESCE(NULLIF(c.caller_number, ''), NULLIF(c.full_number, '')),
    NULLIF(c.email, ''),
    COALESCE(NULLIF(c.customer_company, ''), NULLIF(c.company, '')),
    left(COALESCE(NULLIF(c.requirement, ''), NULLIF(c.notes, ''), NULLIF(c.raw_transcript, '')), 500),
    COALESCE(NULLIF(c.lead_status, ''), NULLIF(c.call_status, ''), 'new'),
    COALESCE(c.sales_person_id, c.assigned_to),
    COALESCE(NULLIF(c.sales_person_name, ''), NULLIF(c.assigned_to_name, '')),
    COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL,
    c.created_at, 'call_logs',
    COALESCE(c.disposition::text, 'untouched'), c.disposition_reason_code, c.disposition_reason_note,
    c.disposition_at, c.disposition_by_name, NULLIF(c.product_name, '')
  FROM public.call_logs c
  WHERE c.lead_source = 'ElevenLabs'
  UNION ALL
  SELECT 'email', e.id::text,
    NULLIF(e.customer_name, ''), NULLIF(e.phone_number, ''), NULLIF(e.email, ''), NULLIF(e.customer_company, ''),
    left(COALESCE(NULLIF(e.subject, ''), NULLIF(e.notes, ''), NULLIF(e.body_text, '')), 500),
    COALESCE(NULLIF(e.status, ''), 'new'),
    e.sales_person_id, NULLIF(e.sales_person_name, ''), e.sales_person_id IS NOT NULL,
    e.created_at, 'email_leads',
    COALESCE(e.disposition::text, 'untouched'), e.disposition_reason_code, e.disposition_reason_note,
    e.disposition_at, e.disposition_by_name, NULLIF(e.product_name, '')
  FROM public.email_leads e
  UNION ALL
  SELECT 'manychat', m.id::text,
    COALESCE(NULLIF(m.customer_name, ''), NULLIF(trim(concat_ws(' ', m.first_name, m.last_name)), '')),
    NULLIF(m.phone_number, ''), NULLIF(m.email, ''), NULLIF(m.company, ''),
    left(COALESCE(NULLIF(m.product_name, ''), NULLIF(m.notes, ''), NULLIF(m.flow_name, ''), NULLIF(m.channel, '')), 500),
    COALESCE(NULLIF(m.status, ''), 'new'),
    m.assigned_to, NULLIF(m.assigned_to_name, ''), m.assigned_to IS NOT NULL,
    m.created_at, 'manychat_leads',
    COALESCE(m.disposition::text, 'untouched'), m.disposition_reason_code, m.disposition_reason_note,
    m.disposition_at, m.disposition_by_name, NULLIF(m.product_name, '')
  FROM public.manychat_leads m
  UNION ALL
  SELECT 'abandoned_cart', a.id::text,
    NULLIF(a.customer_name, ''), NULLIF(a.customer_phone, ''), NULLIF(a.customer_email, ''), NULL::text,
    left(COALESCE(NULLIF(a.recovery_notes, ''), 'Abandoned cart' ||
      CASE WHEN a.cart_value IS NOT NULL THEN ' - ' || COALESCE(a.currency, 'INR') || ' ' || a.cart_value::text ELSE '' END), 500),
    COALESCE(NULLIF(a.status, ''), 'new'),
    NULL::uuid, NULLIF(a.last_contacted_by_name, ''), false,
    a.created_at, 'abandoned_carts_archive',
    'untouched'::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::text
  FROM public.abandoned_carts_archive a
) u;

CREATE OR REPLACE FUNCTION public.get_unified_lead_source_totals()
RETURNS TABLE(source text, total bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT f.source::text AS source, count(*)::bigint AS total
  FROM public.unified_lead_feed f
  GROUP BY f.source
$function$;