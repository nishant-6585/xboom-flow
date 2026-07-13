CREATE OR REPLACE VIEW public.unified_lead_feed AS
 SELECT CASE WHEN l.source = 'Facebook Leads' THEN 'facebook'::text ELSE 'website'::text END AS source,
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
    l.disposition_by_name
   FROM leads l
UNION ALL
 SELECT 'forms'::text AS source, f.id::text, COALESCE(NULLIF(f.customer_name, ''::text), NULL::text), NULLIF(f.phone, ''::text), NULLIF(f.email, ''::text), COALESCE(NULLIF(f.company, ''::text), NULL::text),
    "left"(COALESCE(NULLIF(f.product_name, ''::text), NULLIF(f.notes, ''::text), NULLIF(f.form_name, ''::text)), 500),
    COALESCE(NULLIF(f.status, ''::text), 'new'::text), COALESCE(f.sales_person_id, f.assigned_to),
    COALESCE(NULLIF(f.sales_person_name, ''::text), NULLIF(f.assigned_to_name, ''::text)),
    COALESCE(f.sales_person_id, f.assigned_to) IS NOT NULL, f.created_at, 'form_leads'::text,
    COALESCE(f.disposition::text, 'untouched'::text), f.disposition_reason_code, f.disposition_reason_note, f.disposition_at, f.disposition_by_name
   FROM form_leads f
UNION ALL
 SELECT 'google_ads'::text, g.id::text, COALESCE(NULLIF(g.customer_name, ''::text), NULL::text), NULLIF(g.phone, ''::text), NULLIF(g.email, ''::text), COALESCE(NULLIF(g.customer_company, ''::text), NULL::text),
    "left"(COALESCE(NULLIF(g.product_name, ''::text), NULLIF(g.notes, ''::text), NULLIF(g.campaign_name, ''::text)), 500),
    COALESCE(NULLIF(g.status, ''::text), 'new'::text), g.sales_person_id, NULLIF(g.sales_person_name, ''::text),
    g.sales_person_id IS NOT NULL, g.created_at, 'google_ads_leads'::text,
    COALESCE(g.disposition::text, 'untouched'::text), g.disposition_reason_code, g.disposition_reason_note, g.disposition_at, g.disposition_by_name
   FROM google_ads_leads g
UNION ALL
 SELECT 'interakt'::text, i.id::text, COALESCE(NULLIF(i.customer_name, ''::text), NULL::text), NULLIF(i.phone_number, ''::text), NULLIF(i.email, ''::text),
    COALESCE(NULLIF(i.company, ''::text), NULLIF(i.customer_company, ''::text)),
    "left"(COALESCE(NULLIF(i.product_name, ''::text), NULLIF(i.notes, ''::text), NULLIF(i.source, ''::text)), 500),
    COALESCE(NULLIF(i.status, ''::text), 'new'::text),
    CASE WHEN i.sales_person_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN i.sales_person_id::uuid ELSE NULL::uuid END,
    NULLIF(i.sales_person_name, ''::text), i.sales_person_id IS NOT NULL AND i.sales_person_id <> ''::text, i.created_at, 'interakt_leads'::text,
    COALESCE(i.disposition::text, 'untouched'::text), i.disposition_reason_code, i.disposition_reason_note, i.disposition_at, i.disposition_by_name
   FROM interakt_leads i
UNION ALL
 SELECT 'myoperator'::text, c.id::text,
    COALESCE(NULLIF(c.customer_name, ''::text), NULLIF(c.agent_name, ''::text), NULLIF(c.caller_number, ''::text)),
    COALESCE(NULLIF(c.caller_number, ''::text), NULLIF(c.full_number, ''::text)),
    NULLIF(c.email, ''::text),
    COALESCE(NULLIF(c.customer_company, ''::text), NULLIF(c.company, ''::text)),
    "left"(COALESCE(NULLIF(c.requirement, ''::text), NULLIF(c.notes, ''::text), NULLIF(c.product_name, ''::text), NULLIF(c.call_status, ''::text)), 500),
    COALESCE(NULLIF(c.lead_status, ''::text), NULLIF(c.call_status, ''::text), 'new'::text),
    COALESCE(c.sales_person_id, c.assigned_to),
    COALESCE(NULLIF(c.sales_person_name, ''::text), NULLIF(c.assigned_to_name, ''::text), NULLIF(c.assigned_agent_name, ''::text)),
    COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL, c.created_at, 'call_logs'::text,
    COALESCE(c.disposition::text, 'untouched'::text), c.disposition_reason_code, c.disposition_reason_note, c.disposition_at, c.disposition_by_name
   FROM call_logs c
  WHERE c.lead_source IS DISTINCT FROM 'ElevenLabs'::text
UNION ALL
 SELECT 'elevenlabs'::text, c.id::text,
    COALESCE(NULLIF(c.customer_name, ''::text), NULLIF(c.caller_number, ''::text)),
    COALESCE(NULLIF(c.caller_number, ''::text), NULLIF(c.full_number, ''::text)),
    NULLIF(c.email, ''::text),
    COALESCE(NULLIF(c.customer_company, ''::text), NULLIF(c.company, ''::text)),
    "left"(COALESCE(NULLIF(c.requirement, ''::text), NULLIF(c.notes, ''::text), NULLIF(c.raw_transcript, ''::text)), 500),
    COALESCE(NULLIF(c.lead_status, ''::text), NULLIF(c.call_status, ''::text), 'new'::text),
    COALESCE(c.sales_person_id, c.assigned_to),
    COALESCE(NULLIF(c.sales_person_name, ''::text), NULLIF(c.assigned_to_name, ''::text)),
    COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL, c.created_at, 'call_logs'::text,
    COALESCE(c.disposition::text, 'untouched'::text), c.disposition_reason_code, c.disposition_reason_note, c.disposition_at, c.disposition_by_name
   FROM call_logs c
  WHERE c.lead_source = 'ElevenLabs'::text
UNION ALL
 SELECT 'email'::text, e.id::text, COALESCE(NULLIF(e.customer_name, ''::text), NULL::text), NULLIF(e.phone_number, ''::text), NULLIF(e.email, ''::text),
    COALESCE(NULLIF(e.customer_company, ''::text), NULL::text),
    "left"(COALESCE(NULLIF(e.subject, ''::text), NULLIF(e.notes, ''::text), NULLIF(e.body_text, ''::text)), 500),
    COALESCE(NULLIF(e.status, ''::text), 'new'::text), e.sales_person_id, NULLIF(e.sales_person_name, ''::text),
    e.sales_person_id IS NOT NULL, e.created_at, 'email_leads'::text,
    COALESCE(e.disposition::text, 'untouched'::text), e.disposition_reason_code, e.disposition_reason_note, e.disposition_at, e.disposition_by_name
   FROM email_leads e;

ALTER VIEW public.unified_lead_feed SET (security_invoker = on);

CREATE OR REPLACE VIEW public.unified_lead_feed_dispositions
WITH (security_invoker = true) AS
SELECT CASE WHEN l.source = 'Facebook Leads' THEN 'facebook'::text ELSE 'website'::text END AS source, 'leads'::text AS source_table, l.id::text AS source_row_id,
  NULLIF(l.name,'') AS name, NULLIF(l.phone,'') AS phone, NULLIF(l.email,'') AS email,
  NULLIF(l.company,'') AS company,
  "left"(COALESCE(NULLIF(l.subject,''), NULLIF(l.message,'')), 500) AS subject_or_message,
  l.assigned_to AS sales_person_id, NULLIF(l.assigned_to_name,'') AS sales_person_name,
  l.disposition, l.disposition_reason_code, l.disposition_reason_note, l.disposition_at, l.disposition_by_name,
  l.created_at
FROM public.leads l
UNION ALL
SELECT 'forms', 'form_leads', f.id::text,
  NULLIF(f.customer_name,''), NULLIF(f.phone,''), NULLIF(f.email,''), NULLIF(f.company,''),
  "left"(COALESCE(NULLIF(f.product_name,''), NULLIF(f.notes,''), NULLIF(f.form_name,'')), 500),
  COALESCE(f.sales_person_id, f.assigned_to),
  COALESCE(NULLIF(f.sales_person_name,''), NULLIF(f.assigned_to_name,'')),
  f.disposition, f.disposition_reason_code, f.disposition_reason_note, f.disposition_at, f.disposition_by_name,
  f.created_at
FROM public.form_leads f
UNION ALL
SELECT 'google_ads', 'google_ads_leads', g.id::text,
  NULLIF(g.customer_name,''), NULLIF(g.phone,''), NULLIF(g.email,''), NULLIF(g.customer_company,''),
  "left"(COALESCE(NULLIF(g.product_name,''), NULLIF(g.notes,''), NULLIF(g.campaign_name,'')), 500),
  g.sales_person_id, NULLIF(g.sales_person_name,''),
  g.disposition, g.disposition_reason_code, g.disposition_reason_note, g.disposition_at, g.disposition_by_name,
  g.created_at
FROM public.google_ads_leads g
UNION ALL
SELECT 'interakt', 'interakt_leads', i.id::text,
  NULLIF(i.customer_name,''), NULLIF(i.phone_number,''), NULLIF(i.email,''),
  COALESCE(NULLIF(i.company,''), NULLIF(i.customer_company,'')),
  "left"(COALESCE(NULLIF(i.product_name,''), NULLIF(i.notes,''), NULLIF(i.source,'')), 500),
  CASE WHEN i.sales_person_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN i.sales_person_id::uuid ELSE NULL::uuid END,
  NULLIF(i.sales_person_name,''),
  i.disposition, i.disposition_reason_code, i.disposition_reason_note, i.disposition_at, i.disposition_by_name,
  i.created_at
FROM public.interakt_leads i
UNION ALL
SELECT CASE WHEN c.lead_source = 'ElevenLabs' THEN 'elevenlabs' ELSE 'myoperator' END,
  'call_logs', c.id::text,
  COALESCE(NULLIF(c.customer_name,''), NULLIF(c.caller_number,'')),
  COALESCE(NULLIF(c.caller_number,''), NULLIF(c.full_number,'')),
  NULLIF(c.email,''),
  COALESCE(NULLIF(c.customer_company,''), NULLIF(c.company,'')),
  "left"(COALESCE(NULLIF(c.requirement,''), NULLIF(c.notes,''), NULLIF(c.product_name,'')), 500),
  COALESCE(c.sales_person_id, c.assigned_to),
  COALESCE(NULLIF(c.sales_person_name,''), NULLIF(c.assigned_to_name,'')),
  c.disposition, c.disposition_reason_code, c.disposition_reason_note, c.disposition_at, c.disposition_by_name,
  c.created_at
FROM public.call_logs c
UNION ALL
SELECT 'email', 'email_leads', e.id::text,
  NULLIF(e.customer_name,''), NULLIF(e.phone_number,''), NULLIF(e.email,''), NULLIF(e.customer_company,''),
  "left"(COALESCE(NULLIF(e.subject,''), NULLIF(e.notes,''), NULLIF(e.body_text,'')), 500),
  e.sales_person_id, NULLIF(e.sales_person_name,''),
  e.disposition, e.disposition_reason_code, e.disposition_reason_note, e.disposition_at, e.disposition_by_name,
  e.created_at
FROM public.email_leads e;

GRANT SELECT ON public.unified_lead_feed_dispositions TO authenticated;