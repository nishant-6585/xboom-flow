-- Hourly refresh of stored ManyChat contacts (profile/tags/custom fields).
-- Realtime capture stays in manychat-webhook; this keeps existing rows fresh,
-- matching the "hourly auto-sync" described in Admin → Integrations → ManyChat.
SELECT cron.schedule(
  'manychat-sync-hourly',
  '15 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://mxsotxddcvmeluqonuuj.supabase.co/functions/v1/manychat-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14c290eGRkY3ZtZWx1cW9udXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDg0NjAsImV4cCI6MjA4MzEyNDQ2MH0.O3z9AfLaZfnY5QyCT0eZEf9PQcm5MRNUOQ1lsEg9_ag',
        'x-cron-secret', public.get_cron_secret()
      ),
      body := jsonb_build_object('limit', 200)
    );
  $$
);

-- ManyChat leads table parity with MyOperator:
-- 1. Allow qualify/not-qualify dispositions on manychat_leads rows.
-- 2. Allow ManyChat leads to be moved to Prospects / Attention.

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
    WHEN 'manychat_leads'    THEN _phone_col := 'phone_number';   _email_col := 'email';
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

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_source_type_check;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_source_type_check
  CHECK (source_type = ANY (ARRAY['enquiry'::text, 'interakt'::text, 'myoperator'::text, 'email'::text, 'form_lead'::text, 'google_ads'::text, 'lead'::text, 'manychat'::text]));

ALTER TABLE public.attention_items DROP CONSTRAINT IF EXISTS attention_items_source_type_check;
ALTER TABLE public.attention_items ADD CONSTRAINT attention_items_source_type_check
  CHECK (source_type = ANY (ARRAY['enquiry'::text, 'interakt'::text, 'myoperator'::text, 'email'::text, 'form_lead'::text, 'google_ads'::text, 'lead'::text, 'manychat'::text]));