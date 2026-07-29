
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS response_price_gst_mode TEXT
  CHECK (response_price_gst_mode IN ('inclusive','exclusive'));

CREATE OR REPLACE FUNCTION public.mirror_enquiry_quote_to_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parts text[] := ARRAY[]::text[];
  v_msg text;
  v_price text;
  v_avail text;
  v_lead text;
  v_notes text;
  v_gst text;
  v_gst_suffix text := '';
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.responded_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.response_pricing         IS NOT DISTINCT FROM OLD.response_pricing
     AND NEW.response_availability   IS NOT DISTINCT FROM OLD.response_availability
     AND NEW.response_lead_time      IS NOT DISTINCT FROM OLD.response_lead_time
     AND NEW.response_notes          IS NOT DISTINCT FROM OLD.response_notes
     AND NEW.response_price_gst_mode IS NOT DISTINCT FROM OLD.response_price_gst_mode THEN
    RETURN NEW;
  END IF;

  v_price := btrim(coalesce(NEW.response_pricing, ''));
  v_avail := btrim(coalesce(NEW.response_availability, ''));
  v_lead  := btrim(coalesce(NEW.response_lead_time, ''));
  v_notes := btrim(coalesce(NEW.response_notes, ''));
  v_gst   := btrim(coalesce(NEW.response_price_gst_mode, ''));

  IF v_gst = 'inclusive' THEN
    v_gst_suffix := ' (incl. GST)';
  ELSIF v_gst = 'exclusive' THEN
    v_gst_suffix := ' (excl. GST)';
  END IF;

  IF v_price <> '' THEN v_parts := v_parts || ('Price: ' || v_price || v_gst_suffix); END IF;
  IF v_avail <> '' THEN v_parts := v_parts || ('Availability: ' || v_avail); END IF;
  IF v_lead  <> '' THEN v_parts := v_parts || ('Lead time: ' || v_lead); END IF;

  IF array_length(v_parts, 1) IS NULL AND v_notes = '' THEN
    RETURN NEW;
  END IF;

  v_msg := '📋 Quote updated';
  IF array_length(v_parts, 1) IS NOT NULL THEN
    v_msg := v_msg || ' — ' || array_to_string(v_parts, ' · ');
  END IF;
  IF v_notes <> '' THEN
    v_msg := v_msg || E'\n' || v_notes;
  END IF;

  INSERT INTO public.enquiry_messages
    (enquiry_id, sender_id, sender_name, sender_role, message, is_quote_mirror)
  VALUES
    (NEW.id,
     NEW.responded_by,
     coalesce(NEW.responded_by_name, 'Supply Chain'),
     'supply_chain',
     v_msg,
     true);

  RETURN NEW;
END;
$function$;
