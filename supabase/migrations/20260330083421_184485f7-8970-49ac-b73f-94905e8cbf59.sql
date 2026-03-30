
-- Add retry tracking and sync lock columns to google_ads_sync_log
ALTER TABLE public.google_ads_sync_log 
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_locked_until timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duplicates_skipped integer DEFAULT 0;
