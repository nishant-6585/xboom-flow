
-- Lead disposition enum + columns on 6 source tables + mirror onto contact_directory
-- Skipping abandoned_carts_archive per user direction.

DO $$ BEGIN
  CREATE TYPE public.lead_disposition AS ENUM ('untouched', 'prospect', 'qualified', 'not_qualified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper macro pattern repeated per table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS disposition_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_disposition ON public.leads(disposition) WHERE disposition <> 'untouched';

ALTER TABLE public.form_leads
  ADD COLUMN IF NOT EXISTS disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS disposition_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_form_leads_disposition ON public.form_leads(disposition) WHERE disposition <> 'untouched';

ALTER TABLE public.interakt_leads
  ADD COLUMN IF NOT EXISTS disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS disposition_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_interakt_leads_disposition ON public.interakt_leads(disposition) WHERE disposition <> 'untouched';

ALTER TABLE public.email_leads
  ADD COLUMN IF NOT EXISTS disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS disposition_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_email_leads_disposition ON public.email_leads(disposition) WHERE disposition <> 'untouched';

ALTER TABLE public.google_ads_leads
  ADD COLUMN IF NOT EXISTS disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS disposition_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_google_ads_leads_disposition ON public.google_ads_leads(disposition) WHERE disposition <> 'untouched';

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS disposition_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_call_logs_disposition ON public.call_logs(disposition) WHERE disposition <> 'untouched';

-- Mirror onto contact_directory
ALTER TABLE public.contact_directory
  ADD COLUMN IF NOT EXISTS last_disposition public.lead_disposition NOT NULL DEFAULT 'untouched',
  ADD COLUMN IF NOT EXISTS last_disposition_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS last_disposition_reason_note TEXT,
  ADD COLUMN IF NOT EXISTS last_disposition_at TIMESTAMPTZ;

-- Backfill existing "prospect" status into disposition='prospect' on the 5 tables that have a status column
UPDATE public.leads            SET disposition='prospect' WHERE disposition='untouched' AND lower(COALESCE(status,''))='prospect';
UPDATE public.form_leads       SET disposition='prospect' WHERE disposition='untouched' AND lower(COALESCE(status,''))='prospect';
UPDATE public.interakt_leads   SET disposition='prospect' WHERE disposition='untouched' AND lower(COALESCE(status,''))='prospect';
UPDATE public.email_leads      SET disposition='prospect' WHERE disposition='untouched' AND lower(COALESCE(status,''))='prospect';
UPDATE public.google_ads_leads SET disposition='prospect' WHERE disposition='untouched' AND lower(COALESCE(status,''))='prospect';
-- call_logs has no status column → no backfill

-- ============================================================
-- RPC: set_lead_disposition
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_lead_disposition(
  _source_table TEXT,
  _source_row_id TEXT,
  _new_disposition public.lead_disposition,
  _reason_code TEXT,
  _reason_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _phone TEXT;
  _email TEXT;
  _contact_key TEXT;
  _user_name TEXT;
  _sql TEXT;
  _phone_col TEXT;
  _email_col TEXT;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'sales'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF _new_disposition IN ('qualified', 'not_qualified') THEN
    IF COALESCE(_reason_code,'') = '' THEN
      RAISE EXCEPTION 'reason_required';
    END IF;
    IF _reason_code = 'custom' AND COALESCE(TRIM(_reason_note),'') = '' THEN
      RAISE EXCEPTION 'reason_note_required_for_custom';
    END IF;
  END IF;

  CASE _source_table
    WHEN 'leads'             THEN _phone_col := 'phone';          _email_col := 'email';
    WHEN 'form_leads'        THEN _phone_col := 'phone';          _email_col := 'email';
    WHEN 'interakt_leads'    THEN _phone_col := 'phone_number';   _email_col := 'email';
    WHEN 'email_leads'       THEN _phone_col := 'phone_number';   _email_col := 'email';
    WHEN 'google_ads_leads'  THEN _phone_col := 'phone';          _email_col := 'email';
    WHEN 'call_logs'         THEN _phone_col := 'caller_number';  _email_col := 'email';
    ELSE RAISE EXCEPTION 'invalid_source_table: %', _source_table;
  END CASE;

  SELECT name INTO _user_name FROM public.profiles WHERE user_id = auth.uid();

  _sql := format(
    'UPDATE public.%I
        SET disposition = $1,
            disposition_reason_code = $2,
            disposition_reason_note = $3,
            disposition_at = now(),
            disposition_by = auth.uid(),
            disposition_by_name = $4
      WHERE id::text = $5
      RETURNING %I, %I',
    _source_table, _phone_col, _email_col
  );
  EXECUTE _sql USING _new_disposition, _reason_code, _reason_note, _user_name, _source_row_id
    INTO _phone, _email;

  _contact_key := public.compute_contact_key(_phone, _email);
  IF _contact_key IS NOT NULL THEN
    UPDATE public.contact_directory
      SET last_disposition = _new_disposition,
          last_disposition_reason_code = _reason_code,
          last_disposition_reason_note = _reason_note,
          last_disposition_at = now(),
          updated_at = now()
    WHERE contact_key = _contact_key;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_lead_disposition(TEXT, TEXT, public.lead_disposition, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_disposition(TEXT, TEXT, public.lead_disposition, TEXT, TEXT) TO authenticated;

-- ============================================================
-- View: unified_lead_feed_dispositions
-- Mirrors unified_lead_feed columns + disposition fields + source_table
-- ============================================================
CREATE OR REPLACE VIEW public.unified_lead_feed_dispositions
WITH (security_invoker = true) AS
SELECT 'website'::text AS source, 'leads'::text AS source_table, l.id::text AS source_row_id,
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
  CASE WHEN i.sales_person_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN i.sales_person_id::uuid ELSE NULL::uuid END,
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
