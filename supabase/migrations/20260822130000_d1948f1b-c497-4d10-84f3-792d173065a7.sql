-- =========================================================================
-- Close the agent_user_mapping gaps that force call leads into the fallback.
--
-- resolve_agent_user() looks a MyOperator agent up by agent_id, then by
-- agent_phone, in agent_user_mapping. When neither matches, the webhook has no
-- idea who took the call and drops through to the round-robin fallback — which
-- is how a call answered by Manoj Kumar (an assignable rep!) ended up owned by
-- someone else entirely. A mapped agent keeps their own lead; an unmapped one
-- cannot.
--
-- This migration:
--   1. Adds a view listing every MyOperator agent seen in call payloads that
--      has no active mapping, so the gap is visible instead of silent.
--   2. Seeds mappings where the agent name matches exactly one approved
--      profile, case-insensitively and in full.
--
-- Deliberately conservative on (2): only exact whole-name matches, and only
-- when exactly one profile matches. Fuzzy name matching is what produced the
-- Charles / Fahad mis-assignments in the first place. Everything ambiguous is
-- left for a human in the Agent Mapping admin panel.
-- =========================================================================

-- ---------------------------------------------------------------- 1. the view
CREATE OR REPLACE VIEW public.myoperator_unmapped_agents AS
WITH legs AS (
  SELECT
    cl.id,
    cl.created_at,
    jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(cl.raw_payload -> '_ld') = 'array' THEN cl.raw_payload -> '_ld'
        WHEN jsonb_typeof(cl.raw_payload -> 'log_details') = 'array' THEN cl.raw_payload -> 'log_details'
        ELSE '[]'::jsonb
      END
    ) AS leg
  FROM public.call_logs cl
  WHERE cl.raw_payload IS NOT NULL
    AND jsonb_typeof(cl.raw_payload) = 'object'
),
receivers AS (
  SELECT
    l.created_at,
    jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(l.leg -> '_rr') = 'array' THEN l.leg -> '_rr'
        WHEN jsonb_typeof(l.leg -> 'received_by') = 'array' THEN l.leg -> 'received_by'
        ELSE '[]'::jsonb
      END
    ) AS rr
  FROM legs l
),
agents AS (
  SELECT
    NULLIF(trim(COALESCE(rr ->> '_na', rr ->> 'name')), '')            AS agent_name,
    NULLIF(trim(COALESCE(rr ->> '_id', rr ->> 'agent_id')), '')        AS agent_id,
    NULLIF(trim(COALESCE(rr ->> '_ct', rr ->> 'contact_number')), '')  AS agent_phone,
    created_at
  FROM receivers
)
SELECT
  a.agent_name,
  a.agent_id,
  a.agent_phone,
  COUNT(*)              AS call_count,
  MAX(a.created_at)     AS last_seen_at
FROM agents a
WHERE (a.agent_name IS NOT NULL OR a.agent_id IS NOT NULL OR a.agent_phone IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.agent_user_mapping m
    WHERE m.is_active = true
      AND m.provider = 'myoperator'
      AND (
        (m.agent_id    IS NOT NULL AND m.agent_id    = a.agent_id)
        OR (m.agent_phone IS NOT NULL AND m.agent_phone = a.agent_phone)
      )
  )
GROUP BY a.agent_name, a.agent_id, a.agent_phone
ORDER BY call_count DESC;

COMMENT ON VIEW public.myoperator_unmapped_agents IS
  'MyOperator agents appearing in call_logs.raw_payload with no active agent_user_mapping row. Each one forces the webhook into round-robin fallback instead of assigning the lead to the rep who took the call.';

GRANT SELECT ON public.myoperator_unmapped_agents TO authenticated;

-- ------------------------------------------------- 2. seed unambiguous matches
DO $seed$
DECLARE
  r         RECORD;
  v_user    UUID;
  v_matches INT;
  v_added   INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.myoperator_unmapped_agents WHERE agent_name IS NOT NULL
  LOOP
    SELECT COUNT(*) INTO v_matches
    FROM public.profiles p
    WHERE p.is_approved = true
      AND lower(trim(p.name)) = lower(trim(r.agent_name));

    -- Exactly one profile, or we do not guess.
    CONTINUE WHEN v_matches <> 1;

    SELECT p.user_id INTO v_user
    FROM public.profiles p
    WHERE p.is_approved = true
      AND lower(trim(p.name)) = lower(trim(r.agent_name))
    LIMIT 1;

    INSERT INTO public.agent_user_mapping
      (provider, agent_id, agent_phone, agent_name, user_id, is_active, notes)
    VALUES
      ('myoperator', r.agent_id, r.agent_phone, r.agent_name, v_user, true,
       'Auto-seeded from exact profile-name match; verify in the Agent Mapping panel.')
    ON CONFLICT DO NOTHING;

    v_added := v_added + 1;
  END LOOP;

  RAISE NOTICE 'Seeded % MyOperator agent mapping(s) from exact name matches. Remaining gaps are listed in public.myoperator_unmapped_agents.', v_added;
END
$seed$;
