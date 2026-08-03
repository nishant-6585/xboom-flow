ALTER TABLE public.agent_user_mapping ADD COLUMN IF NOT EXISTS agent_name text;

DROP FUNCTION IF EXISTS public.list_interakt_owner_mappings();

CREATE OR REPLACE FUNCTION public.list_interakt_owner_mappings()
RETURNS TABLE (
  owner_id text,
  owner_label text,
  lead_count bigint,
  unassigned_count bigint,
  last_seen timestamptz,
  user_id uuid,
  user_name text,
  label text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.owner_id,
    m.agent_name AS owner_label,
    o.lead_count,
    o.unassigned_count,
    o.last_seen,
    m.user_id,
    p.name,
    p.name AS label
  FROM (
    SELECT
      l.interakt_traits->>'_internal_contact_owner_id' AS owner_id,
      count(*) AS lead_count,
      count(*) FILTER (WHERE l.sales_person_id IS NULL) AS unassigned_count,
      max(l.created_at) AS last_seen
    FROM public.interakt_leads l
    WHERE NULLIF(l.interakt_traits->>'_internal_contact_owner_id', '') IS NOT NULL
    GROUP BY 1
  ) o
  LEFT JOIN public.agent_user_mapping m
    ON m.provider = 'interakt' AND m.agent_id = o.owner_id AND m.is_active
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'sales_manager')
  ORDER BY COALESCE(m.agent_name, o.owner_id), o.lead_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.upsert_interakt_owner_mapping(
  _owner_id text,
  _user_id uuid,
  _label text DEFAULT NULL,
  _agent_name text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_updated integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can map Interakt account owners';
  END IF;
  IF NULLIF(_owner_id, '') IS NULL THEN
    RAISE EXCEPTION 'owner_id is required';
  END IF;

  IF _user_id IS NULL THEN
    UPDATE public.agent_user_mapping
       SET is_active = false, updated_at = now()
     WHERE provider = 'interakt' AND agent_id = _owner_id;
    RETURN 0;
  END IF;

  SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.agent_user_mapping WHERE provider = 'interakt' AND agent_id = _owner_id) THEN
    UPDATE public.agent_user_mapping
       SET user_id = _user_id,
           notes = COALESCE(_label, notes),
           agent_name = COALESCE(NULLIF(_agent_name, ''), agent_name),
           is_active = true,
           updated_at = now()
     WHERE provider = 'interakt' AND agent_id = _owner_id;
  ELSE
    INSERT INTO public.agent_user_mapping (provider, agent_id, user_id, notes, agent_name, is_active)
    VALUES ('interakt', _owner_id, _user_id, _label, NULLIF(_agent_name, ''), true);
  END IF;

  UPDATE public.interakt_leads
     SET sales_person_id = _user_id::text,
         sales_person_name = COALESCE(v_name, sales_person_name)
   WHERE sales_person_id IS NULL
     AND interakt_traits->>'_internal_contact_owner_id' = _owner_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.list_interakt_owner_mappings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_interakt_owner_mapping(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_interakt_owner_mappings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_interakt_owner_mapping(text, uuid, text, text) TO authenticated;
