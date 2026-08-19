CREATE TABLE IF NOT EXISTS public.lead_walk_in_details (
  lead_id            bigint PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  visited_at         timestamptz NOT NULL DEFAULT now(),
  store_location     text,
  accompanied_by     text,
  products_interested text[] NOT NULL DEFAULT '{}',
  budget_range       text,
  purchase_timeline  text,
  visit_outcome      text,
  follow_up_at       timestamptz,
  referral_source    text,
  notes              text,
  created_by         uuid,
  created_by_name    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_walk_in_details IS 'Visit detail for leads with source = ''walk_in''. 1:1 with public.leads.';

ALTER TABLE public.lead_walk_in_details DROP CONSTRAINT IF EXISTS lead_walk_in_timeline_check;
ALTER TABLE public.lead_walk_in_details ADD CONSTRAINT lead_walk_in_timeline_check CHECK (
  purchase_timeline IS NULL OR purchase_timeline IN ('immediate','this_week','this_month','this_quarter','exploring'));

ALTER TABLE public.lead_walk_in_details DROP CONSTRAINT IF EXISTS lead_walk_in_outcome_check;
ALTER TABLE public.lead_walk_in_details ADD CONSTRAINT lead_walk_in_outcome_check CHECK (
  visit_outcome IS NULL OR visit_outcome IN ('purchased','quote_requested','demo_given','will_return','just_browsing','not_interested'));

CREATE INDEX IF NOT EXISTS idx_walk_in_visited_at ON public.lead_walk_in_details (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_walk_in_follow_up ON public.lead_walk_in_details (follow_up_at) WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_walk_in_store ON public.lead_walk_in_details (store_location);
CREATE INDEX IF NOT EXISTS idx_leads_walk_in ON public.leads (created_at DESC) WHERE source = 'walk_in';

GRANT SELECT, UPDATE ON public.lead_walk_in_details TO authenticated;
GRANT ALL ON public.lead_walk_in_details TO service_role;

ALTER TABLE public.lead_walk_in_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "walk_in: read own or manage" ON public.lead_walk_in_details;
CREATE POLICY "walk_in: read own or manage"
  ON public.lead_walk_in_details FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR has_role(auth.uid(), 'supply_chain'::app_role)
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_walk_in_details.lead_id AND l.assigned_to = auth.uid())
  );

DROP POLICY IF EXISTS "walk_in: owner updates" ON public.lead_walk_in_details;
CREATE POLICY "walk_in: owner updates"
  ON public.lead_walk_in_details FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_manager'::app_role)
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_walk_in_details.lead_id AND l.assigned_to = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.leads_set_walk_in_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'walk_in' THEN RETURN NEW; END IF;

  IF NEW.assigned_to IS NULL AND v_uid IS NOT NULL THEN NEW.assigned_to := v_uid; END IF;

  IF NEW.assigned_to IS NOT NULL AND (NEW.assigned_to_name IS NULL OR NEW.assigned_to_name = '') THEN
    SELECT COALESCE(NULLIF(p.name, ''), p.email) INTO v_name FROM public.profiles p WHERE p.user_id = NEW.assigned_to;
    NEW.assigned_to_name := v_name;
  END IF;

  IF NEW.last_contacted_at IS NULL THEN NEW.last_contacted_at := now(); END IF;
  IF NEW.disposition = 'untouched'::lead_disposition THEN NEW.disposition := 'prospect'::lead_disposition; END IF;
  IF NEW.status IS NULL OR NEW.status = 'new' THEN NEW.status := 'contacted'; END IF;
  IF NEW.form_type IS NULL THEN NEW.form_type := 'walk-in'; END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_leads_walk_in_defaults ON public.leads;
CREATE TRIGGER trg_leads_walk_in_defaults
  BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_set_walk_in_defaults();

CREATE OR REPLACE FUNCTION public.create_walk_in_lead(
  _name text,
  _phone text,
  _email text DEFAULT NULL,
  _company text DEFAULT NULL,
  _store_location text DEFAULT NULL,
  _products_interested text[] DEFAULT '{}',
  _budget_range text DEFAULT NULL,
  _purchase_timeline text DEFAULT NULL,
  _visit_outcome text DEFAULT NULL,
  _follow_up_at timestamptz DEFAULT NULL,
  _referral_source text DEFAULT NULL,
  _accompanied_by text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _visited_at timestamptz DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_lead_id bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (has_role(v_uid, 'sales'::app_role) OR has_role(v_uid, 'sales_manager'::app_role) OR has_role(v_uid, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'only sales can record a walk-in';
  END IF;
  IF COALESCE(trim(_name), '') = '' THEN RAISE EXCEPTION 'name is required'; END IF;
  IF COALESCE(trim(_phone), '') = '' THEN RAISE EXCEPTION 'phone is required'; END IF;

  SELECT COALESCE(NULLIF(p.name, ''), p.email) INTO v_name FROM public.profiles p WHERE p.user_id = v_uid;

  INSERT INTO public.leads
    (source, form_type, name, phone, email, company, subject, message,
     assigned_to, assigned_to_name, status, disposition, last_contacted_at, submitted_at, payload)
  VALUES
    ('walk_in', 'walk-in', trim(_name), trim(_phone),
     NULLIF(trim(COALESCE(_email, '')), ''),
     NULLIF(trim(COALESCE(_company, '')), ''),
     NULLIF(array_to_string(_products_interested, ', '), ''),
     NULLIF(trim(COALESCE(_notes, '')), ''),
     v_uid, v_name, 'contacted', 'prospect'::lead_disposition, now(),
     COALESCE(_visited_at, now())::text,
     jsonb_build_object('walk_in', true, 'store_location', _store_location))
  RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_walk_in_details
    (lead_id, visited_at, store_location, accompanied_by, products_interested,
     budget_range, purchase_timeline, visit_outcome, follow_up_at, referral_source, notes, created_by, created_by_name)
  VALUES
    (v_lead_id, COALESCE(_visited_at, now()), NULLIF(trim(COALESCE(_store_location,'')),''),
     NULLIF(trim(COALESCE(_accompanied_by,'')),''), COALESCE(_products_interested, '{}'),
     NULLIF(trim(COALESCE(_budget_range,'')),''), _purchase_timeline, _visit_outcome,
     _follow_up_at, NULLIF(trim(COALESCE(_referral_source,'')),''),
     NULLIF(trim(COALESCE(_notes,'')),''), v_uid, v_name);

  RETURN v_lead_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_walk_in_lead(text,text,text,text,text,text[],text,text,text,timestamptz,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_walk_in_lead(text,text,text,text,text,text[],text,text,text,timestamptz,text,text,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.find_leads_by_contact(_phone text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS TABLE (source text, source_row_id text, name text, phone text, email text, company text, status text, sales_person_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_digits text := NULLIF(right(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), 10), '');
  v_email text := NULLIF(lower(trim(COALESCE(_email, ''))), '');
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF NOT (has_role(v_uid, 'sales'::app_role) OR has_role(v_uid, 'sales_manager'::app_role) OR has_role(v_uid, 'admin'::app_role)) THEN
    RETURN;
  END IF;
  IF v_digits IS NULL AND v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.source, f.source_row_id, f.name, f.phone, f.email, f.company, f.status, f.sales_person_name, f.created_at
    FROM public.unified_lead_feed f
   WHERE (v_digits IS NOT NULL AND right(regexp_replace(COALESCE(f.phone, ''), '\D', '', 'g'), 10) = v_digits)
      OR (v_email IS NOT NULL AND lower(COALESCE(f.email, '')) = v_email)
   ORDER BY f.created_at DESC
   LIMIT 10;
END;
$fn$;

REVOKE ALL ON FUNCTION public.find_leads_by_contact(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_leads_by_contact(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_walk_in_leads(_mine_only boolean DEFAULT false, _limit integer DEFAULT 200)
RETURNS TABLE (
  lead_id bigint, name text, phone text, email text, company text, status text, disposition text,
  assigned_to uuid, assigned_to_name text, created_at timestamptz, visited_at timestamptz,
  store_location text, products_interested text[], budget_range text, purchase_timeline text,
  visit_outcome text, follow_up_at timestamptz, referral_source text, accompanied_by text,
  notes text, follow_up_overdue boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_manages boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  v_manages := has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'sales_manager'::app_role) OR has_role(v_uid, 'supply_chain'::app_role);
  IF NOT (v_manages OR has_role(v_uid, 'sales'::app_role)) THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.id, l.name, l.phone, l.email, l.company, l.status, l.disposition::text, l.assigned_to,
         l.assigned_to_name, l.created_at, d.visited_at, d.store_location, d.products_interested,
         d.budget_range, d.purchase_timeline, d.visit_outcome, d.follow_up_at, d.referral_source,
         d.accompanied_by, d.notes,
         (d.follow_up_at IS NOT NULL AND d.follow_up_at < now()
          AND COALESCE(d.visit_outcome, '') NOT IN ('purchased', 'not_interested')) AS follow_up_overdue
    FROM public.leads l
    LEFT JOIN public.lead_walk_in_details d ON d.lead_id = l.id
   WHERE l.source = 'walk_in'
     AND (v_manages OR l.assigned_to = v_uid)
     AND (NOT _mine_only OR l.assigned_to = v_uid)
   ORDER BY COALESCE(d.visited_at, l.created_at) DESC
   LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_walk_in_leads(boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_walk_in_leads(boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_walk_in_outcome(_lead_id bigint, _visit_outcome text DEFAULT NULL, _follow_up_at timestamptz DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leads l
     WHERE l.id = _lead_id AND l.source = 'walk_in'
       AND (l.assigned_to = v_uid OR has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'sales_manager'::app_role))
  ) THEN
    RAISE EXCEPTION 'not your walk-in';
  END IF;

  UPDATE public.lead_walk_in_details
     SET visit_outcome = COALESCE(_visit_outcome, visit_outcome),
         follow_up_at  = COALESCE(_follow_up_at, follow_up_at),
         notes         = COALESCE(_notes, notes),
         updated_at    = now()
   WHERE lead_id = _lead_id;

  UPDATE public.leads
     SET last_contacted_at = now(),
         status = CASE WHEN _visit_outcome = 'purchased' THEN 'converted'
                       WHEN _visit_outcome = 'not_interested' THEN 'archived'
                       ELSE status END,
         disposition = CASE WHEN _visit_outcome = 'not_interested' THEN 'not_qualified'::lead_disposition
                            WHEN _visit_outcome = 'purchased' THEN 'qualified'::lead_disposition
                            ELSE disposition END
   WHERE id = _lead_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_walk_in_outcome(bigint, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_walk_in_outcome(bigint, text, timestamptz, text) TO authenticated;