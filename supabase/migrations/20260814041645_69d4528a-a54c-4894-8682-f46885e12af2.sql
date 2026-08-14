-- 1. New disposition value
ALTER TYPE public.lead_disposition ADD VALUE IF NOT EXISTS 'junk';

-- 2. Junk detection rule
CREATE OR REPLACE FUNCTION public.is_junk_lead(_name text, _enquiry text, _product text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(NULLIF(btrim(COALESCE(_enquiry, '')), ''), '') = ''
     AND COALESCE(NULLIF(btrim(COALESCE(_product, '')), ''), '') = ''
     AND length(regexp_replace(COALESCE(_name, ''), '[^[:alpha:]]', '', 'g')) < 3
$$;

-- 3. Generic BEFORE INSERT auto-disposition trigger.
--    TG_ARGV[0] = name column; TG_ARGV[1..] = columns that count as enquiry content.
CREATE OR REPLACE FUNCTION public.trg_auto_junk_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _row jsonb := to_jsonb(NEW);
  _name text;
  _txt text := '';
  i int;
BEGIN
  IF COALESCE(NEW.disposition::text, 'untouched') <> 'untouched' THEN
    RETURN NEW;
  END IF;

  _name := _row ->> TG_ARGV[0];
  FOR i IN 1 .. (TG_NARGS - 1) LOOP
    _txt := _txt || ' ' || COALESCE(_row ->> TG_ARGV[i], '');
  END LOOP;

  IF public.is_junk_lead(_name, _txt, '') THEN
    NEW.disposition := 'junk'::public.lead_disposition;
    NEW.disposition_reason_code := 'auto_no_enquiry';
    NEW.disposition_reason_note := 'Auto-marked: no enquiry text, no product and an unusable name';
    NEW.disposition_at := now();
    NEW.disposition_by := NULL;
    NEW.disposition_by_name := 'Auto rule';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_junk_leads ON public.leads;
CREATE TRIGGER trg_auto_junk_leads
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_junk_lead('name', 'subject', 'message');

DROP TRIGGER IF EXISTS trg_auto_junk_form_leads ON public.form_leads;
CREATE TRIGGER trg_auto_junk_form_leads
  BEFORE INSERT ON public.form_leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_junk_lead('customer_name', 'product_name', 'notes');

DROP TRIGGER IF EXISTS trg_auto_junk_google_ads_leads ON public.google_ads_leads;
CREATE TRIGGER trg_auto_junk_google_ads_leads
  BEFORE INSERT ON public.google_ads_leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_junk_lead('customer_name', 'product_name', 'notes');

DROP TRIGGER IF EXISTS trg_auto_junk_interakt_leads ON public.interakt_leads;
CREATE TRIGGER trg_auto_junk_interakt_leads
  BEFORE INSERT ON public.interakt_leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_junk_lead('customer_name', 'product_name', 'notes');

DROP TRIGGER IF EXISTS trg_auto_junk_call_logs ON public.call_logs;
CREATE TRIGGER trg_auto_junk_call_logs
  BEFORE INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_junk_lead('customer_name', 'requirement', 'notes', 'product_name');

DROP TRIGGER IF EXISTS trg_auto_junk_email_leads ON public.email_leads;
CREATE TRIGGER trg_auto_junk_email_leads
  BEFORE INSERT ON public.email_leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_junk_lead('customer_name', 'subject', 'notes', 'body_text');

-- 4. Bulk assignment helper across lead sources
CREATE OR REPLACE FUNCTION public.set_lead_assignee(
  _source_table text,
  _source_row_id text,
  _user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _name TEXT;
  _id_col TEXT;
  _name_col TEXT;
  _is_text_id BOOLEAN := false;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'sales'::public.app_role)
    OR public.has_role(auth.uid(), 'sales_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  CASE _source_table
    WHEN 'leads'            THEN _id_col := 'assigned_to';      _name_col := 'assigned_to_name';
    WHEN 'form_leads'       THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'google_ads_leads' THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'email_leads'      THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'call_logs'        THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
    WHEN 'interakt_leads'   THEN _id_col := 'sales_person_id';  _name_col := 'sales_person_name';
                                 _is_text_id := true;
    ELSE RAISE EXCEPTION 'invalid_source_table: %', _source_table;
  END CASE;

  SELECT name INTO _name FROM public.profiles WHERE user_id = _user_id;

  EXECUTE format(
    'UPDATE public.%I SET %I = $1, %I = $2 WHERE id::text = $3',
    _source_table, _id_col, _name_col
  ) USING (CASE WHEN _is_text_id THEN _user_id::text ELSE NULL END), _name, _source_row_id;
EXCEPTION WHEN datatype_mismatch OR invalid_text_representation THEN
  RAISE;
END $$;

REVOKE ALL ON FUNCTION public.set_lead_assignee(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_lead_assignee(text, text, uuid) TO authenticated;