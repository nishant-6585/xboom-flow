-- Robust push-subscription save.
--
-- A browser's push endpoint is UNIQUE, and on shared computers the existing
-- row for an endpoint may belong to a DIFFERENT user. The client-side
-- upsert then fails RLS ("new row violates row-level security policy") —
-- users saw this after re-enabling push. This SECURITY DEFINER RPC
-- reassigns the endpoint to whoever enables push last, which is correct:
-- a browser delivers to whoever is sitting at it.

CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = v_uid,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;
