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
  v_existing_user_id uuid;
  v_existing_label text;
  v_updated integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can map Interakt account owners';
  END IF;
  IF NULLIF(_owner_id, '') IS NULL THEN
    RAISE EXCEPTION 'owner_id is required';
  END IF;

  SELECT user_id, notes
    INTO v_existing_user_id, v_existing_label
    FROM public.agent_user_mapping
   WHERE provider = 'interakt' AND agent_id = _owner_id
   LIMIT 1;

  -- Label-only update: keep existing mapping, just rename the owner.
  IF _user_id IS NULL AND NULLIF(_agent_name, '') IS NOT NULL THEN
    IF v_existing_user_id IS NULL THEN
      RAISE EXCEPTION 'Set a salesperson before adding an owner label';
    END IF;
    UPDATE public.agent_user_mapping
       SET agent_name = _agent_name, updated_at = now()
     WHERE provider = 'interakt' AND agent_id = _owner_id;
    RETURN 0;
  END IF;

  -- Clear mapping when no user and no label.
  IF _user_id IS NULL THEN
    UPDATE public.agent_user_mapping
       SET is_active = false, updated_at = now()
     WHERE provider = 'interakt' AND agent_id = _owner_id;
    RETURN 0;
  END IF;

  SELECT p.name INTO v_name FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1;

  IF v_existing_user_id IS NOT NULL THEN
    UPDATE public.agent_user_mapping
       SET user_id = _user_id,
           notes = COALESCE(NULLIF(_label, ''), v_existing_label),
           agent_name = COALESCE(NULLIF(_agent_name, ''), agent_name),
           is_active = true,
           updated_at = now()
     WHERE provider = 'interakt' AND agent_id = _owner_id;
  ELSE
    INSERT INTO public.agent_user_mapping (provider, agent_id, user_id, notes, agent_name, is_active)
    VALUES ('interakt', _owner_id, _user_id, NULLIF(_label, ''), NULLIF(_agent_name, ''), true);
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

REVOKE ALL ON FUNCTION public.upsert_interakt_owner_mapping(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_interakt_owner_mapping(text, uuid, text, text) TO authenticated;
