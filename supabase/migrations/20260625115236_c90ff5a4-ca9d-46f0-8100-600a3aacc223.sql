
-- 1) dm_threads
CREATE TABLE public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_threads_users_sorted CHECK (user_a < user_b),
  CONSTRAINT dm_threads_users_distinct CHECK (user_a <> user_b)
);
CREATE UNIQUE INDEX dm_threads_pair_uidx ON public.dm_threads(user_a, user_b);
CREATE INDEX dm_threads_user_a_idx ON public.dm_threads(user_a, last_message_at DESC);
CREATE INDEX dm_threads_user_b_idx ON public.dm_threads(user_b, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.dm_threads TO authenticated;
GRANT ALL ON public.dm_threads TO service_role;

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read their threads"
  ON public.dm_threads FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Participants can update their threads"
  ON public.dm_threads FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- Inserts happen via SECURITY DEFINER RPC only; no INSERT policy.

-- 2) dm_messages
CREATE TABLE public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 5000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dm_messages_thread_created_idx ON public.dm_messages(thread_id, created_at DESC);
CREATE INDEX dm_messages_unread_idx ON public.dm_messages(thread_id, read_at) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.dm_messages TO authenticated;
GRANT ALL ON public.dm_messages TO service_role;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read messages"
  ON public.dm_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = dm_messages.thread_id
        AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
    )
  );

CREATE POLICY "Sender can send messages in their threads"
  ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = dm_messages.thread_id
        AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
    )
  );

CREATE POLICY "Recipient can mark messages read"
  ON public.dm_messages FOR UPDATE TO authenticated
  USING (
    auth.uid() <> sender_id
    AND EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = dm_messages.thread_id
        AND (auth.uid() = t.user_a OR auth.uid() = t.user_b)
    )
  )
  WITH CHECK (
    auth.uid() <> sender_id
  );

-- 3) Trigger: bump thread last_message_at + preview on new message
CREATE OR REPLACE FUNCTION public.dm_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dm_threads
     SET last_message_at = NEW.created_at,
         last_message_preview = left(NEW.body, 200)
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dm_messages_after_insert_trg
AFTER INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.dm_messages_after_insert();

-- 4) RPC: get_or_create_dm_thread
CREATE OR REPLACE FUNCTION public.get_or_create_dm_thread(other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  a uuid;
  b uuid;
  tid uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF other_user IS NULL OR other_user = me THEN
    RAISE EXCEPTION 'invalid recipient';
  END IF;

  IF me < other_user THEN
    a := me; b := other_user;
  ELSE
    a := other_user; b := me;
  END IF;

  SELECT id INTO tid FROM public.dm_threads WHERE user_a = a AND user_b = b;
  IF tid IS NULL THEN
    INSERT INTO public.dm_threads(user_a, user_b) VALUES (a, b)
    RETURNING id INTO tid;
  END IF;

  RETURN tid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_dm_thread(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_dm_thread(uuid) TO authenticated;

-- 5) Realtime
ALTER TABLE public.dm_threads REPLICA IDENTITY FULL;
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
