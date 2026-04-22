-- Remove the entire ElevenLabs ↔ MyOperator mapping layer.
-- Keeps raw call_logs and call_ai_analysis intact.

-- 1. Drop any cron jobs that re-run the backfill function. Wrapped in DO so
--    missing extension/jobs don't fail the migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE command ILIKE '%backfill-call-mapping%'
       OR command ILIKE '%call_mapping%'
       OR jobname ILIKE '%call_mapping%'
       OR jobname ILIKE '%rematch%';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore — cron schema may not be accessible
  NULL;
END $$;

-- 2. Remove realtime publication entry (ignore if not present).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'call_mapping'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.call_mapping';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'call_lead_status'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.call_lead_status';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Drop the mapping table entirely (cascade removes FKs/indexes/policies).
DROP TABLE IF EXISTS public.call_mapping CASCADE;

-- 4. Drop the call_lead_status table (added as part of the mapping-based
--    "sales-first" upgrade that we are also reverting).
DROP TABLE IF EXISTS public.call_lead_status CASCADE;