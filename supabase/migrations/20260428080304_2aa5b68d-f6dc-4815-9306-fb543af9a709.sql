
CREATE TABLE IF NOT EXISTS public.agent_user_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  agent_id text,
  agent_phone text,
  user_id uuid NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_user_mapping_has_identifier CHECK (agent_id IS NOT NULL OR agent_phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_user_mapping_provider_agent_id_key
  ON public.agent_user_mapping (provider, agent_id) WHERE agent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_user_mapping_provider_agent_phone_key
  ON public.agent_user_mapping (provider, agent_phone) WHERE agent_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_user_mapping_user_id_idx ON public.agent_user_mapping (user_id);

DROP TRIGGER IF EXISTS trg_agent_user_mapping_updated_at ON public.agent_user_mapping;
CREATE TRIGGER trg_agent_user_mapping_updated_at
BEFORE UPDATE ON public.agent_user_mapping
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_user_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_user_mapping_select_authenticated" ON public.agent_user_mapping;
CREATE POLICY "agent_user_mapping_select_authenticated"
  ON public.agent_user_mapping FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agent_user_mapping_admin_insert" ON public.agent_user_mapping;
CREATE POLICY "agent_user_mapping_admin_insert"
  ON public.agent_user_mapping FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "agent_user_mapping_admin_update" ON public.agent_user_mapping;
CREATE POLICY "agent_user_mapping_admin_update"
  ON public.agent_user_mapping FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "agent_user_mapping_admin_delete" ON public.agent_user_mapping;
CREATE POLICY "agent_user_mapping_admin_delete"
  ON public.agent_user_mapping FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.resolve_agent_user(
  _provider text,
  _agent_id text,
  _agent_phone text
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF _agent_id IS NOT NULL THEN
    SELECT user_id INTO v_user FROM public.agent_user_mapping
     WHERE is_active = true AND provider = _provider AND agent_id = _agent_id LIMIT 1;
    IF v_user IS NOT NULL THEN RETURN v_user; END IF;
  END IF;
  IF _agent_phone IS NOT NULL THEN
    SELECT user_id INTO v_user FROM public.agent_user_mapping
     WHERE is_active = true AND provider = _provider AND agent_phone = _agent_phone LIMIT 1;
    IF v_user IS NOT NULL THEN RETURN v_user; END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE VIEW public.lead_assignment_mismatches AS
WITH leads AS (
  SELECT id::text AS lead_id, 'enquiries'::text AS source, sales_person_id::uuid AS sales_person_id, NULL::text AS agent_id, NULL::text AS agent_phone
    FROM public.enquiries WHERE sales_person_id IS NOT NULL
  UNION ALL
  SELECT id::text, 'call_logs'::text, sales_person_id::uuid, NULL::text, assigned_agent_phone::text
    FROM public.call_logs WHERE sales_person_id IS NOT NULL
  UNION ALL
  SELECT id::text, 'email_leads'::text, sales_person_id::uuid, NULL::text, NULL::text FROM public.email_leads WHERE sales_person_id IS NOT NULL
  UNION ALL
  SELECT id::text, 'form_leads'::text, sales_person_id::uuid, NULL::text, NULL::text FROM public.form_leads WHERE sales_person_id IS NOT NULL
  UNION ALL
  SELECT id::text, 'google_ads_leads'::text, sales_person_id::uuid, NULL::text, NULL::text FROM public.google_ads_leads WHERE sales_person_id IS NOT NULL
  UNION ALL
  SELECT id::text, 'interakt_leads'::text, sales_person_id::uuid, NULL::text, NULL::text FROM public.interakt_leads WHERE sales_person_id IS NOT NULL
)
SELECT
  l.lead_id,
  l.source,
  l.sales_person_id AS current_user_id,
  m.user_id        AS expected_user_id,
  l.agent_id,
  l.agent_phone
FROM leads l
JOIN public.agent_user_mapping m
  ON m.is_active = true
 AND ((l.agent_id IS NOT NULL AND m.agent_id = l.agent_id)
   OR (l.agent_phone IS NOT NULL AND m.agent_phone = l.agent_phone))
WHERE l.sales_person_id <> m.user_id;
