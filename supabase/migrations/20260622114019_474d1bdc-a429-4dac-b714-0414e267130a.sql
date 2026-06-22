-- 1) Lock search_path on validate_order_customer_phone
ALTER FUNCTION public.validate_order_customer_phone() SET search_path = public, pg_temp;

-- 2) Tighten realtime.messages policies: require either a postgres_changes
-- subscription (still RLS-protected on the underlying table) OR a topic
-- that contains the caller's auth.uid(). Broadcast/presence on generic
-- channels are no longer accessible to other users.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy WHERE polrelid = 'realtime.messages'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON realtime.messages', r.polname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can read scoped realtime topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      extension = 'postgres_changes'
      OR topic LIKE '%' || auth.uid()::text || '%'
    )
  );

CREATE POLICY "Authenticated users can write scoped realtime topics"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      extension = 'postgres_changes'
      OR topic LIKE '%' || auth.uid()::text || '%'
    )
  );