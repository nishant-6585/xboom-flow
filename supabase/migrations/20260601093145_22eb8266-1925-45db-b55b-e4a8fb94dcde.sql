-- =========================================================================
-- LEAD MANAGEMENT v2 — PART 1
-- =========================================================================

ALTER TABLE public.email_leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

ALTER TABLE public.interakt_leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

ALTER TABLE public.google_ads_leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;

-- Helpers
CREATE OR REPLACE FUNCTION public.normalize_phone(_raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d TEXT;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_raw, '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  d := regexp_replace(d, '^0+', '');
  IF length(d) = 10 THEN d := '91' || d;
  ELSIF length(d) = 11 AND left(d,1) = '0' THEN d := '91' || substr(d, 2);
  END IF;
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.compute_contact_key(_phone TEXT, _email TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE np TEXT; e TEXT;
BEGIN
  np := public.normalize_phone(_phone);
  IF np IS NOT NULL AND length(np) >= 8 THEN RETURN 'p:' || np; END IF;
  e := lower(trim(COALESCE(_email,'')));
  IF e <> '' AND e LIKE '%@%' THEN RETURN 'e:' || e; END IF;
  RETURN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS public.contact_directory (
  contact_key TEXT PRIMARY KEY,
  normalized_phone TEXT,
  email_key TEXT,
  display_name TEXT,
  current_owner UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  current_owner_name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  touchpoint_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_directory_phone ON public.contact_directory(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_contact_directory_email ON public.contact_directory(email_key);
CREATE INDEX IF NOT EXISTS idx_contact_directory_owner ON public.contact_directory(current_owner);

GRANT SELECT ON public.contact_directory TO authenticated;
GRANT ALL ON public.contact_directory TO service_role;

ALTER TABLE public.contact_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_select_approved" ON public.contact_directory;
CREATE POLICY "directory_select_approved"
ON public.contact_directory FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_approved = true)
  AND (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager') OR public.has_role(auth.uid(),'admin'))
);

CREATE TABLE IF NOT EXISTS public.contact_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_key TEXT NOT NULL REFERENCES public.contact_directory(contact_key) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_row_id TEXT NOT NULL,
  normalized_phone TEXT,
  email_key TEXT,
  contact_name TEXT,
  summary TEXT,
  status TEXT,
  assigned_to UUID,
  assigned_to_name TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_row_id)
);
CREATE INDEX IF NOT EXISTS idx_touchpoints_contact_key ON public.contact_touchpoints(contact_key);
CREATE INDEX IF NOT EXISTS idx_touchpoints_occurred_at ON public.contact_touchpoints(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_source ON public.contact_touchpoints(source);

GRANT SELECT ON public.contact_touchpoints TO authenticated;
GRANT ALL ON public.contact_touchpoints TO service_role;

ALTER TABLE public.contact_touchpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "touchpoints_select_approved" ON public.contact_touchpoints;
CREATE POLICY "touchpoints_select_approved"
ON public.contact_touchpoints FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.is_approved = true)
  AND (public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'sales_manager') OR public.has_role(auth.uid(),'admin'))
);

-- record_touchpoint
CREATE OR REPLACE FUNCTION public.record_touchpoint(
  _source TEXT, _source_row_id TEXT, _phone TEXT, _email TEXT, _name TEXT,
  _occurred_at TIMESTAMPTZ, _summary TEXT, _status TEXT,
  _assigned_to UUID, _assigned_to_name TEXT, _raw JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key TEXT; _np TEXT; _ek TEXT;
BEGIN
  _key := public.compute_contact_key(_phone, _email);
  IF _key IS NULL THEN RETURN; END IF;
  _np := public.normalize_phone(_phone);
  _ek := NULLIF(lower(trim(COALESCE(_email,''))), '');

  INSERT INTO public.contact_directory (
    contact_key, normalized_phone, email_key, display_name,
    current_owner, current_owner_name, first_seen_at, last_seen_at, touchpoint_count
  ) VALUES (
    _key, _np, _ek, NULLIF(trim(COALESCE(_name,'')),''),
    _assigned_to, _assigned_to_name,
    COALESCE(_occurred_at, now()), COALESCE(_occurred_at, now()), 1
  )
  ON CONFLICT (contact_key) DO UPDATE SET
    normalized_phone   = COALESCE(EXCLUDED.normalized_phone, public.contact_directory.normalized_phone),
    email_key          = COALESCE(EXCLUDED.email_key, public.contact_directory.email_key),
    display_name       = COALESCE(EXCLUDED.display_name, public.contact_directory.display_name),
    current_owner      = COALESCE(EXCLUDED.current_owner, public.contact_directory.current_owner),
    current_owner_name = COALESCE(EXCLUDED.current_owner_name, public.contact_directory.current_owner_name),
    last_seen_at       = GREATEST(public.contact_directory.last_seen_at, COALESCE(EXCLUDED.last_seen_at, now())),
    first_seen_at      = LEAST(public.contact_directory.first_seen_at, COALESCE(EXCLUDED.first_seen_at, now())),
    touchpoint_count   = public.contact_directory.touchpoint_count + 1,
    updated_at         = now();

  INSERT INTO public.contact_touchpoints (
    contact_key, source, source_row_id, normalized_phone, email_key,
    contact_name, summary, status, assigned_to, assigned_to_name, occurred_at, raw
  ) VALUES (
    _key, _source, _source_row_id, _np, _ek,
    NULLIF(trim(COALESCE(_name,'')),''), _summary, _status, _assigned_to, _assigned_to_name,
    COALESCE(_occurred_at, now()), _raw
  )
  ON CONFLICT (source, source_row_id) DO NOTHING;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_touchpoint(TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,UUID,TEXT,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_touchpoint(TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TEXT,TEXT,UUID,TEXT,JSONB) TO authenticated, service_role;

-- assign_lead_with_sticky
CREATE OR REPLACE FUNCTION public.assign_lead_with_sticky(
  _phone TEXT, _email TEXT, _form_type TEXT DEFAULT NULL,
  OUT user_id UUID, OUT user_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key TEXT; _owner UUID; _owner_name TEXT; _last_assignee UUID;
        _rohit UUID; _rohit_name TEXT;
BEGIN
  user_id := NULL; user_name := NULL;
  IF lower(COALESCE(_form_type,'')) = 'drone-repair-intake' THEN
    SELECT p.user_id, p.name INTO _rohit, _rohit_name
    FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true AND ur.role IN ('sales','sales_manager')
      AND p.name ILIKE 'rohit%'
      AND public.is_user_available_on(p.user_id, CURRENT_DATE)
    ORDER BY p.user_id LIMIT 1;
    IF _rohit IS NOT NULL THEN user_id := _rohit; user_name := _rohit_name; RETURN; END IF;
  END IF;

  _key := public.compute_contact_key(_phone, _email);
  IF _key IS NOT NULL THEN
    SELECT current_owner, current_owner_name INTO _owner, _owner_name
    FROM public.contact_directory WHERE contact_key = _key;
    IF _owner IS NOT NULL AND public.is_user_available_on(_owner, CURRENT_DATE) THEN
      user_id := _owner; user_name := _owner_name; RETURN;
    END IF;
  END IF;

  SELECT a.uid INTO _last_assignee
  FROM public.contact_directory d
  JOIN public.available_website_lead_assignees() a ON a.uid = d.current_owner
  ORDER BY d.updated_at DESC NULLS LAST LIMIT 1;

  SELECT a.uid, a.uname INTO user_id, user_name
  FROM public.available_website_lead_assignees() a
  WHERE _last_assignee IS NULL OR a.uid > _last_assignee
  ORDER BY a.uid LIMIT 1;

  IF user_id IS NULL THEN
    SELECT a.uid, a.uname INTO user_id, user_name
    FROM public.available_website_lead_assignees() a ORDER BY a.uid LIMIT 1;
  END IF;

  IF user_id IS NULL THEN
    SELECT p.user_id, p.name INTO user_id, user_name
    FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.is_approved = true AND ur.role IN ('sales','sales_manager')
      AND COALESCE(p.name,'') !~* '(charles|fahad|umar|vishal)'
    ORDER BY p.user_id LIMIT 1;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.assign_lead_with_sticky(TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_lead_with_sticky(TEXT,TEXT,TEXT) TO authenticated, service_role;

-- ==== triggers ====
-- call_logs
CREATE OR REPLACE FUNCTION public._a_sticky_call_logs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _phone TEXT; _key TEXT; _owner UUID; _r RECORD;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  _phone := COALESCE(NEW.full_number, NEW.caller_number);
  _key := public.compute_contact_key(_phone, NEW.email);
  IF _key IS NOT NULL THEN
    SELECT current_owner INTO _owner FROM public.contact_directory WHERE contact_key = _key;
    IF _owner IS NOT NULL THEN
      SELECT * INTO _r FROM public.assign_lead_with_sticky(_phone, NEW.email, NULL);
      IF _r.user_id IS NOT NULL THEN
        NEW.assigned_to := _r.user_id; NEW.assigned_to_name := _r.user_name;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _a_sticky_call_logs ON public.call_logs;
CREATE TRIGGER _a_sticky_call_logs BEFORE INSERT ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public._a_sticky_call_logs();

CREATE OR REPLACE FUNCTION public._z_touchpoint_call_logs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _src TEXT;
BEGIN
  _src := CASE WHEN NEW.lead_source = 'ElevenLabs' THEN 'elevenlabs' ELSE 'myoperator' END;
  PERFORM public.record_touchpoint(_src, NEW.id::text,
    COALESCE(NEW.full_number, NEW.caller_number), NEW.email, NEW.customer_name,
    NEW.created_at, NEW.call_status, NEW.lead_status,
    NEW.assigned_to, NEW.assigned_to_name, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _z_touchpoint_call_logs ON public.call_logs;
CREATE TRIGGER _z_touchpoint_call_logs AFTER INSERT ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public._z_touchpoint_call_logs();

-- leads
CREATE OR REPLACE FUNCTION public._a_sticky_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key TEXT; _owner UUID; _r RECORD;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.form_type,'')) = 'drone-repair-intake' THEN RETURN NEW; END IF;
  _key := public.compute_contact_key(NEW.phone, NEW.email);
  IF _key IS NULL THEN RETURN NEW; END IF;
  SELECT current_owner INTO _owner FROM public.contact_directory WHERE contact_key = _key;
  IF _owner IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _r FROM public.assign_lead_with_sticky(NEW.phone, NEW.email, NEW.form_type);
  IF _r.user_id IS NOT NULL THEN
    NEW.assigned_to := _r.user_id; NEW.assigned_to_name := _r.user_name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _a_sticky_leads ON public.leads;
CREATE TRIGGER _a_sticky_leads BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public._a_sticky_leads();

CREATE OR REPLACE FUNCTION public._z_touchpoint_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _src TEXT;
BEGIN
  _src := CASE WHEN NEW.form_type = 'website_abandoned' THEN 'abandoned_cart' ELSE 'leads' END;
  PERFORM public.record_touchpoint(_src, NEW.id::text, NEW.phone, NEW.email, NEW.name,
    NEW.created_at, NEW.form_type, NULL, NEW.assigned_to, NEW.assigned_to_name, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _z_touchpoint_leads ON public.leads;
CREATE TRIGGER _z_touchpoint_leads AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public._z_touchpoint_leads();

-- form_leads
CREATE OR REPLACE FUNCTION public._a_sticky_form_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key TEXT; _owner UUID; _r RECORD;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN RETURN NEW; END IF;
  _key := public.compute_contact_key(NEW.phone, NEW.email);
  IF _key IS NULL THEN RETURN NEW; END IF;
  SELECT current_owner INTO _owner FROM public.contact_directory WHERE contact_key = _key;
  IF _owner IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _r FROM public.assign_lead_with_sticky(NEW.phone, NEW.email, NEW.form_name);
  IF _r.user_id IS NOT NULL THEN
    NEW.assigned_to := _r.user_id; NEW.assigned_to_name := _r.user_name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _a_sticky_form_leads ON public.form_leads;
CREATE TRIGGER _a_sticky_form_leads BEFORE INSERT ON public.form_leads
FOR EACH ROW EXECUTE FUNCTION public._a_sticky_form_leads();

CREATE OR REPLACE FUNCTION public._z_touchpoint_form_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.record_touchpoint('form', NEW.id::text, NEW.phone, NEW.email,
    NEW.customer_name, NEW.created_at, NEW.form_name, NEW.status,
    NEW.assigned_to, NEW.assigned_to_name, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _z_touchpoint_form_leads ON public.form_leads;
CREATE TRIGGER _z_touchpoint_form_leads AFTER INSERT ON public.form_leads
FOR EACH ROW EXECUTE FUNCTION public._z_touchpoint_form_leads();

-- interakt_leads (sales_person_id is TEXT)
CREATE OR REPLACE FUNCTION public._a_sticky_interakt_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    SELECT * INTO _r FROM public.assign_lead_with_sticky(NEW.phone_number, NEW.email, NULL);
    IF _r.user_id IS NOT NULL THEN
      NEW.assigned_to := _r.user_id; NEW.assigned_to_name := _r.user_name;
    END IF;
  END IF;
  IF (NEW.sales_person_id IS NULL OR NEW.sales_person_id = '') AND NEW.assigned_to IS NOT NULL THEN
    NEW.sales_person_id := NEW.assigned_to::text;
    NEW.sales_person_name := NEW.assigned_to_name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _a_sticky_interakt_leads ON public.interakt_leads;
CREATE TRIGGER _a_sticky_interakt_leads BEFORE INSERT ON public.interakt_leads
FOR EACH ROW EXECUTE FUNCTION public._a_sticky_interakt_leads();

CREATE OR REPLACE FUNCTION public._z_touchpoint_interakt_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.record_touchpoint('interakt', NEW.id::text, NEW.phone_number, NEW.email,
    NEW.customer_name, COALESCE(NEW.interakt_created_at, NEW.created_at),
    NEW.product_name, NEW.status, NEW.assigned_to, NEW.assigned_to_name, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _z_touchpoint_interakt_leads ON public.interakt_leads;
CREATE TRIGGER _z_touchpoint_interakt_leads AFTER INSERT ON public.interakt_leads
FOR EACH ROW EXECUTE FUNCTION public._z_touchpoint_interakt_leads();

-- email_leads
CREATE OR REPLACE FUNCTION public._a_sticky_email_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    SELECT * INTO _r FROM public.assign_lead_with_sticky(NEW.phone_number, NEW.email, NULL);
    IF _r.user_id IS NOT NULL THEN
      NEW.assigned_to := _r.user_id; NEW.assigned_to_name := _r.user_name;
    END IF;
  END IF;
  IF NEW.sales_person_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    NEW.sales_person_id := NEW.assigned_to;
    NEW.sales_person_name := NEW.assigned_to_name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _a_sticky_email_leads ON public.email_leads;
CREATE TRIGGER _a_sticky_email_leads BEFORE INSERT ON public.email_leads
FOR EACH ROW EXECUTE FUNCTION public._a_sticky_email_leads();

CREATE OR REPLACE FUNCTION public._z_touchpoint_email_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.record_touchpoint('email', NEW.id::text, NEW.phone_number, NEW.email,
    NEW.customer_name, NEW.created_at, NEW.subject, NEW.status,
    NEW.assigned_to, NEW.assigned_to_name, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _z_touchpoint_email_leads ON public.email_leads;
CREATE TRIGGER _z_touchpoint_email_leads AFTER INSERT ON public.email_leads
FOR EACH ROW EXECUTE FUNCTION public._z_touchpoint_email_leads();

-- google_ads_leads
CREATE OR REPLACE FUNCTION public._a_sticky_google_ads_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    SELECT * INTO _r FROM public.assign_lead_with_sticky(NEW.phone, NEW.email, NULL);
    IF _r.user_id IS NOT NULL THEN
      NEW.assigned_to := _r.user_id; NEW.assigned_to_name := _r.user_name;
    END IF;
  END IF;
  IF NEW.sales_person_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    NEW.sales_person_id := NEW.assigned_to;
    NEW.sales_person_name := NEW.assigned_to_name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _a_sticky_google_ads_leads ON public.google_ads_leads;
CREATE TRIGGER _a_sticky_google_ads_leads BEFORE INSERT ON public.google_ads_leads
FOR EACH ROW EXECUTE FUNCTION public._a_sticky_google_ads_leads();

CREATE OR REPLACE FUNCTION public._z_touchpoint_google_ads_leads()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.record_touchpoint('google_ads', NEW.id::text, NEW.phone, NEW.email,
    NEW.customer_name, NEW.created_at, NEW.product_name, NEW.status,
    NEW.assigned_to, NEW.assigned_to_name, NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS _z_touchpoint_google_ads_leads ON public.google_ads_leads;
CREATE TRIGGER _z_touchpoint_google_ads_leads AFTER INSERT ON public.google_ads_leads
FOR EACH ROW EXECUTE FUNCTION public._z_touchpoint_google_ads_leads();

-- ===== BACKFILL =====
DO $backfill$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, full_number, caller_number, email, customer_name, created_at,
                  call_status, lead_status, lead_source, assigned_to, assigned_to_name
           FROM public.call_logs ORDER BY created_at ASC
  LOOP
    PERFORM public.record_touchpoint(
      CASE WHEN r.lead_source = 'ElevenLabs' THEN 'elevenlabs' ELSE 'myoperator' END,
      r.id::text, COALESCE(r.full_number, r.caller_number), r.email, r.customer_name,
      r.created_at, r.call_status, r.lead_status, r.assigned_to, r.assigned_to_name, NULL);
  END LOOP;

  FOR r IN SELECT id, phone, email, name, created_at, form_type, assigned_to, assigned_to_name
           FROM public.leads ORDER BY created_at ASC
  LOOP
    PERFORM public.record_touchpoint(
      CASE WHEN r.form_type = 'website_abandoned' THEN 'abandoned_cart' ELSE 'leads' END,
      r.id::text, r.phone, r.email, r.name, r.created_at, r.form_type, NULL,
      r.assigned_to, r.assigned_to_name, NULL);
  END LOOP;

  FOR r IN SELECT id, phone, email, customer_name, created_at, form_name, status,
                  assigned_to, assigned_to_name
           FROM public.form_leads ORDER BY created_at ASC
  LOOP
    PERFORM public.record_touchpoint('form', r.id::text, r.phone, r.email, r.customer_name,
      r.created_at, r.form_name, r.status, r.assigned_to, r.assigned_to_name, NULL);
  END LOOP;

  -- sync interakt assigned_to from sales_person_id (TEXT → UUID with safety regex)
  UPDATE public.interakt_leads
     SET assigned_to = sales_person_id::uuid,
         assigned_to_name = sales_person_name
   WHERE assigned_to IS NULL
     AND sales_person_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  FOR r IN SELECT id, phone_number, email, customer_name, interakt_created_at, created_at,
                  product_name, status, assigned_to, assigned_to_name
           FROM public.interakt_leads ORDER BY COALESCE(interakt_created_at, created_at) ASC
  LOOP
    PERFORM public.record_touchpoint('interakt', r.id::text, r.phone_number, r.email,
      r.customer_name, COALESCE(r.interakt_created_at, r.created_at),
      r.product_name, r.status, r.assigned_to, r.assigned_to_name, NULL);
  END LOOP;

  UPDATE public.email_leads
     SET assigned_to = sales_person_id, assigned_to_name = sales_person_name
   WHERE assigned_to IS NULL AND sales_person_id IS NOT NULL;

  FOR r IN SELECT id, phone_number, email, customer_name, created_at, subject, status,
                  assigned_to, assigned_to_name
           FROM public.email_leads ORDER BY created_at ASC
  LOOP
    PERFORM public.record_touchpoint('email', r.id::text, r.phone_number, r.email,
      r.customer_name, r.created_at, r.subject, r.status,
      r.assigned_to, r.assigned_to_name, NULL);
  END LOOP;

  UPDATE public.google_ads_leads
     SET assigned_to = sales_person_id, assigned_to_name = sales_person_name
   WHERE assigned_to IS NULL AND sales_person_id IS NOT NULL;

  FOR r IN SELECT id, phone, email, customer_name, created_at, product_name, status,
                  assigned_to, assigned_to_name
           FROM public.google_ads_leads ORDER BY created_at ASC
  LOOP
    PERFORM public.record_touchpoint('google_ads', r.id::text, r.phone, r.email,
      r.customer_name, r.created_at, r.product_name, r.status,
      r.assigned_to, r.assigned_to_name, NULL);
  END LOOP;
END $backfill$;

-- Assign orphan call_logs (the only table currently with NULL assigned_to)
DO $assign$
DECLARE r RECORD; _res RECORD;
BEGIN
  FOR r IN SELECT id, full_number, caller_number, email FROM public.call_logs
           WHERE assigned_to IS NULL ORDER BY created_at ASC
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(
      COALESCE(r.full_number, r.caller_number), r.email, NULL);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.call_logs
         SET assigned_to = _res.user_id, assigned_to_name = _res.user_name
       WHERE id = r.id;
      UPDATE public.contact_directory d
         SET current_owner = COALESCE(d.current_owner, _res.user_id),
             current_owner_name = COALESCE(d.current_owner_name, _res.user_name),
             updated_at = now()
       WHERE d.contact_key = public.compute_contact_key(
             COALESCE(r.full_number, r.caller_number), r.email);
    END IF;
  END LOOP;
END $assign$;

-- ===== HOURLY CRON SWEEP =====
CREATE OR REPLACE FUNCTION public.assign_orphan_leads_sweep()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; _res RECORD; _n INTEGER := 0;
BEGIN
  FOR r IN SELECT id, full_number, caller_number, email FROM public.call_logs
    WHERE assigned_to IS NULL AND created_at > now() - INTERVAL '24 hours'
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(COALESCE(r.full_number, r.caller_number), r.email, NULL);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.call_logs SET assigned_to=_res.user_id, assigned_to_name=_res.user_name WHERE id=r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT id, phone, email, form_type FROM public.leads
    WHERE assigned_to IS NULL AND created_at > now() - INTERVAL '24 hours'
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(r.phone, r.email, r.form_type);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.leads SET assigned_to=_res.user_id, assigned_to_name=_res.user_name WHERE id=r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT id, phone, email, form_name FROM public.form_leads
    WHERE assigned_to IS NULL AND created_at > now() - INTERVAL '24 hours'
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(r.phone, r.email, r.form_name);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.form_leads SET assigned_to=_res.user_id, assigned_to_name=_res.user_name WHERE id=r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT id, phone_number, email FROM public.interakt_leads
    WHERE assigned_to IS NULL AND created_at > now() - INTERVAL '24 hours'
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(r.phone_number, r.email, NULL);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.interakt_leads
         SET assigned_to=_res.user_id, assigned_to_name=_res.user_name,
             sales_person_id=COALESCE(NULLIF(sales_person_id,''), _res.user_id::text),
             sales_person_name=COALESCE(sales_person_name, _res.user_name)
       WHERE id=r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT id, phone_number, email FROM public.email_leads
    WHERE assigned_to IS NULL AND created_at > now() - INTERVAL '24 hours'
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(r.phone_number, r.email, NULL);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.email_leads
         SET assigned_to=_res.user_id, assigned_to_name=_res.user_name,
             sales_person_id=COALESCE(sales_person_id, _res.user_id),
             sales_person_name=COALESCE(sales_person_name, _res.user_name)
       WHERE id=r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  FOR r IN SELECT id, phone, email FROM public.google_ads_leads
    WHERE assigned_to IS NULL AND created_at > now() - INTERVAL '24 hours'
  LOOP
    SELECT * INTO _res FROM public.assign_lead_with_sticky(r.phone, r.email, NULL);
    IF _res.user_id IS NOT NULL THEN
      UPDATE public.google_ads_leads
         SET assigned_to=_res.user_id, assigned_to_name=_res.user_name,
             sales_person_id=COALESCE(sales_person_id, _res.user_id),
             sales_person_name=COALESCE(sales_person_name, _res.user_name)
       WHERE id=r.id;
      _n := _n + 1;
    END IF;
  END LOOP;
  RETURN _n;
END $$;

REVOKE EXECUTE ON FUNCTION public.assign_orphan_leads_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_orphan_leads_sweep() TO service_role;

DO $cron$
BEGIN
  PERFORM cron.unschedule('assign-orphan-leads-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;

SELECT cron.schedule(
  'assign-orphan-leads-hourly', '0 * * * *',
  $cmd$ SELECT public.assign_orphan_leads_sweep(); $cmd$
);