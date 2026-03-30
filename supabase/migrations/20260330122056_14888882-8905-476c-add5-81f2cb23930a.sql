-- Backfill existing Google Ads leads: extract real data from raw_google_payload
-- The submission_data has column_name "unknown", so we parse by heuristic (position + pattern)
CREATE OR REPLACE FUNCTION public.backfill_google_ads_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec RECORD;
  sub_data JSONB;
  field_val TEXT;
  v_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_city TEXT;
  i INT;
BEGIN
  FOR rec IN
    SELECT id, raw_google_payload
    FROM public.enquiries
    WHERE lead_source = 'google_ads'
      AND customer_name = 'Google Ads Lead'
      AND raw_google_payload IS NOT NULL
  LOOP
    sub_data := (rec.raw_google_payload::jsonb) -> 'submission_data';
    IF sub_data IS NULL OR jsonb_typeof(sub_data) != 'array' THEN
      CONTINUE;
    END IF;

    v_name := NULL; v_email := NULL; v_phone := NULL; v_city := NULL;

    FOR i IN 0..jsonb_array_length(sub_data) - 1 LOOP
      field_val := TRIM(sub_data -> i ->> 'string_value');
      IF field_val IS NULL OR field_val = '' THEN CONTINUE; END IF;

      IF v_email IS NULL AND field_val ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
        v_email := field_val;
      ELSIF v_phone IS NULL AND REGEXP_REPLACE(field_val, '\s', '', 'g') ~ '^\+?\d[\d\-\(\)]{6,}$' THEN
        v_phone := field_val;
      ELSIF v_name IS NULL THEN
        v_name := field_val;
      ELSIF v_city IS NULL THEN
        v_city := field_val;
      END IF;
    END LOOP;

    UPDATE public.enquiries
    SET
      customer_name = COALESCE(v_name, customer_name),
      product_code = COALESCE(v_phone, product_code),
      notes = CONCAT_WS(E'\n',
        CASE WHEN v_email IS NOT NULL THEN 'Email: ' || v_email END,
        CASE WHEN v_phone IS NOT NULL THEN 'Phone: ' || v_phone END,
        CASE WHEN v_city IS NOT NULL THEN 'City: ' || v_city END,
        'Source: Google Ads',
        CASE WHEN (rec.raw_google_payload::jsonb ->> 'campaign_id') IS NOT NULL THEN 'Campaign ID: ' || (rec.raw_google_payload::jsonb ->> 'campaign_id') END,
        CASE WHEN (rec.raw_google_payload::jsonb ->> 'ad_group_id') IS NOT NULL THEN 'Ad Group: ' || (rec.raw_google_payload::jsonb ->> 'ad_group_id') END
      ),
      updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Run the backfill
SELECT public.backfill_google_ads_leads();

-- Drop the function after use
DROP FUNCTION IF EXISTS public.backfill_google_ads_leads();