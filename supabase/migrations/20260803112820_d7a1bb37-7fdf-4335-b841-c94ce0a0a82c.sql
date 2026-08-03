CREATE OR REPLACE FUNCTION public.assign_interakt_lead_from_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner text;
  v_user uuid;
  v_name text;
BEGIN
  IF NEW.sales_person_id IS NOT NULL AND NEW.sales_person_id <> '' THEN
    RETURN NEW;
  END IF;

  v_owner := NULLIF(NEW.interakt_traits->>'_internal_contact_owner_id', '');
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  v_user := public.resolve_agent_user('interakt', v_owner, NULL);
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = v_user LIMIT 1;

  NEW.sales_person_id := v_user::text;
  NEW.sales_person_name := COALESCE(v_name, NEW.sales_person_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_interakt_lead_from_owner ON public.interakt_leads;
CREATE TRIGGER trg_assign_interakt_lead_from_owner
BEFORE INSERT ON public.interakt_leads
FOR EACH ROW EXECUTE FUNCTION public.assign_interakt_lead_from_owner();

CREATE OR REPLACE FUNCTION public.list_interakt_owner_mappings()
RETURNS TABLE (
  owner_id text,
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
    o.lead_count,
    o.unassigned_count,
    o.last_seen,
    m.user_id,
    p.name,
    m.notes
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
  ORDER BY o.lead_count DESC;
$$;

CREATE OR REPLACE FUNCTION public.upsert_interakt_owner_mapping(
  _owner_id text,
  _user_id uuid,
  _label text DEFAULT NULL
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
       SET user_id = _user_id, notes = COALESCE(_label, notes), is_active = true, updated_at = now()
     WHERE provider = 'interakt' AND agent_id = _owner_id;
  ELSE
    INSERT INTO public.agent_user_mapping (provider, agent_id, user_id, notes, is_active)
    VALUES ('interakt', _owner_id, _user_id, _label, true);
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
REVOKE ALL ON FUNCTION public.upsert_interakt_owner_mapping(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_interakt_owner_mappings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_interakt_owner_mapping(text, uuid, text) TO authenticated;