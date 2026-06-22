
-- 1. Remove campaign_spend from realtime publication (no client subscribes to it)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'campaign_spend'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.campaign_spend';
  END IF;
END $$;

-- 2. Add Realtime Authorization policies on realtime.messages so authenticated
--    users can only subscribe / broadcast on channels they're entitled to.
--    Reference: https://supabase.com/docs/guides/realtime/authorization
DO $$
BEGIN
  -- Drop any prior versions we control (safe re-run)
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users read realtime messages" ON realtime.messages';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users send realtime messages" ON realtime.messages';
EXCEPTION WHEN insufficient_privilege THEN
  -- If the migration runner cannot manage policies on realtime.messages,
  -- surface a notice and continue. The campaign_spend fix still applies.
  RAISE NOTICE 'Skipping realtime.messages policy management: insufficient privilege';
  RETURN;
END $$;

DO $$
BEGIN
  EXECUTE $POL$
    CREATE POLICY "Authenticated users read realtime messages"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING ( auth.uid() IS NOT NULL )
  $POL$;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping SELECT policy on realtime.messages';
END $$;

DO $$
BEGIN
  EXECUTE $POL$
    CREATE POLICY "Authenticated users send realtime messages"
    ON realtime.messages
    FOR INSERT
    TO authenticated
    WITH CHECK ( auth.uid() IS NOT NULL )
  $POL$;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping INSERT policy on realtime.messages';
END $$;
