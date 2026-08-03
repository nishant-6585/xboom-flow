CREATE OR REPLACE FUNCTION public.upsert_interakt_owner_label_admin(_owner_id text, _agent_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only admins can set Interakt owner labels';
  END IF;

  IF _owner_id IS NULL OR btrim(_owner_id) = '' OR _agent_name IS NULL OR btrim(_agent_name) = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.agent_user_mapping
     SET agent_name = btrim(_agent_name),
         updated_at = now()
   WHERE source = 'interakt'
     AND agent_id = btrim(_owner_id);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    INSERT INTO public.agent_user_mapping (source, agent_id, agent_name)
    VALUES ('interakt', btrim(_owner_id), btrim(_agent_name));
    v_rows := 1;
  END IF;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_interakt_owner_label_admin(text, text) TO authenticated, service_role;