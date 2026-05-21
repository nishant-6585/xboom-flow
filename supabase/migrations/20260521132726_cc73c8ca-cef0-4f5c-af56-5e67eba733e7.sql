-- Supporting indexes (no-op if present)
CREATE INDEX IF NOT EXISTS idx_form_leads_created_at ON public.form_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interakt_leads_created_at ON public.interakt_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_leads_created_at ON public.google_ads_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON public.call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON public.enquiries (created_at DESC);

DROP VIEW IF EXISTS public.unified_lead_feed;

CREATE VIEW public.unified_lead_feed
WITH (security_invoker = true)
AS
-- Website (raw leads table — website forms)
SELECT
  'website'::text                       AS source,
  l.id::text                            AS source_row_id,
  COALESCE(NULLIF(l.name, ''), NULL)    AS name,
  NULLIF(l.phone, '')                   AS phone,
  NULLIF(l.email, '')                   AS email,
  NULLIF(l.company, '')                 AS company,
  LEFT(COALESCE(NULLIF(l.subject,''), NULLIF(l.message,'')), 500) AS subject_or_message,
  COALESCE(NULLIF(l.status,''), 'new')  AS status,
  l.assigned_to                         AS sales_person_id,
  NULLIF(l.assigned_to_name,'')         AS sales_person_name,
  (l.assigned_to IS NOT NULL)           AS is_assigned,
  l.created_at                          AS created_at
FROM public.leads l

UNION ALL

-- Custom forms (QForms)
SELECT
  'forms'::text,
  f.id::text,
  COALESCE(NULLIF(f.customer_name,''), NULL),
  NULLIF(f.phone,''),
  NULLIF(f.email,''),
  COALESCE(NULLIF(f.company,''), NULL),
  LEFT(COALESCE(NULLIF(f.product_name,''), NULLIF(f.notes,''), NULLIF(f.form_name,'')), 500),
  COALESCE(NULLIF(f.status,''), 'new'),
  COALESCE(f.sales_person_id, f.assigned_to),
  COALESCE(NULLIF(f.sales_person_name,''), NULLIF(f.assigned_to_name,'')),
  (COALESCE(f.sales_person_id, f.assigned_to) IS NOT NULL),
  f.created_at
FROM public.form_leads f

UNION ALL

-- Google Ads
SELECT
  'google_ads'::text,
  g.id::text,
  COALESCE(NULLIF(g.customer_name,''), NULL),
  NULLIF(g.phone,''),
  NULLIF(g.email,''),
  COALESCE(NULLIF(g.customer_company,''), NULL),
  LEFT(COALESCE(NULLIF(g.product_name,''), NULLIF(g.notes,''), NULLIF(g.campaign_name,'')), 500),
  COALESCE(NULLIF(g.status,''), 'new'),
  g.sales_person_id,
  NULLIF(g.sales_person_name,''),
  (g.sales_person_id IS NOT NULL),
  g.created_at
FROM public.google_ads_leads g

UNION ALL

-- Interakt (sales_person_id is text in this table — cast safely)
SELECT
  'interakt'::text,
  i.id::text,
  COALESCE(NULLIF(i.customer_name,''), NULL),
  NULLIF(i.phone_number,''),
  NULLIF(i.email,''),
  COALESCE(NULLIF(i.company,''), NULLIF(i.customer_company,'')),
  LEFT(COALESCE(NULLIF(i.product_name,''), NULLIF(i.notes,''), NULLIF(i.source,'')), 500),
  COALESCE(NULLIF(i.status,''), 'new'),
  CASE
    WHEN i.sales_person_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN i.sales_person_id::uuid
    ELSE NULL
  END,
  NULLIF(i.sales_person_name,''),
  (i.sales_person_id IS NOT NULL AND i.sales_person_id <> ''),
  i.created_at
FROM public.interakt_leads i

UNION ALL

-- MyOperator (call_logs minus ElevenLabs rows)
SELECT
  'myoperator'::text,
  c.id::text,
  COALESCE(NULLIF(c.customer_name,''), NULLIF(c.agent_name,''), NULLIF(c.caller_number,'')),
  COALESCE(NULLIF(c.caller_number,''), NULLIF(c.full_number,'')),
  NULLIF(c.email,''),
  COALESCE(NULLIF(c.customer_company,''), NULLIF(c.company,'')),
  LEFT(COALESCE(NULLIF(c.requirement,''), NULLIF(c.notes,''), NULLIF(c.product_name,''), NULLIF(c.call_status,'')), 500),
  COALESCE(NULLIF(c.lead_status,''), NULLIF(c.call_status,''), 'new'),
  COALESCE(c.sales_person_id, c.assigned_to),
  COALESCE(NULLIF(c.sales_person_name,''), NULLIF(c.assigned_to_name,''), NULLIF(c.assigned_agent_name,'')),
  (COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL),
  c.created_at
FROM public.call_logs c
WHERE c.lead_source IS DISTINCT FROM 'ElevenLabs'

UNION ALL

-- ElevenLabs (call_logs filtered)
SELECT
  'elevenlabs'::text,
  c.id::text,
  COALESCE(NULLIF(c.customer_name,''), NULLIF(c.caller_number,'')),
  COALESCE(NULLIF(c.caller_number,''), NULLIF(c.full_number,'')),
  NULLIF(c.email,''),
  COALESCE(NULLIF(c.customer_company,''), NULLIF(c.company,'')),
  LEFT(COALESCE(NULLIF(c.requirement,''), NULLIF(c.notes,''), NULLIF(c.raw_transcript,'')), 500),
  COALESCE(NULLIF(c.lead_status,''), NULLIF(c.call_status,''), 'new'),
  COALESCE(c.sales_person_id, c.assigned_to),
  COALESCE(NULLIF(c.sales_person_name,''), NULLIF(c.assigned_to_name,'')),
  (COALESCE(c.sales_person_id, c.assigned_to) IS NOT NULL),
  c.created_at
FROM public.call_logs c
WHERE c.lead_source = 'ElevenLabs'

UNION ALL

-- Email
SELECT
  'email'::text,
  e.id::text,
  COALESCE(NULLIF(e.customer_name,''), NULL),
  NULLIF(e.phone_number,''),
  NULLIF(e.email,''),
  COALESCE(NULLIF(e.customer_company,''), NULL),
  LEFT(COALESCE(NULLIF(e.subject,''), NULLIF(e.notes,''), NULLIF(e.body_text,'')), 500),
  COALESCE(NULLIF(e.status,''), 'new'),
  e.sales_person_id,
  NULLIF(e.sales_person_name,''),
  (e.sales_person_id IS NOT NULL),
  e.created_at
FROM public.email_leads e;

REVOKE ALL ON public.unified_lead_feed FROM PUBLIC, anon;
GRANT SELECT ON public.unified_lead_feed TO authenticated;