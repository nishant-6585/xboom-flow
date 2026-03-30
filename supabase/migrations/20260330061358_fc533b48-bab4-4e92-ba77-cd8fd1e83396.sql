
-- Google Ads integration sync tracking table
CREATE TABLE public.google_ads_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  leads_fetched INTEGER NOT NULL DEFAULT 0,
  leads_inserted INTEGER NOT NULL DEFAULT 0,
  leads_skipped INTEGER NOT NULL DEFAULT 0,
  errors TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success',
  sync_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add Google Ads attribution columns to enquiries
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_lead_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_group_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS raw_google_payload JSONB DEFAULT NULL;

-- Create unique index on google_lead_id for dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_google_lead_id 
  ON public.enquiries (google_lead_id) WHERE google_lead_id IS NOT NULL;

-- RLS for sync log (admin only)
ALTER TABLE public.google_ads_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync logs"
  ON public.google_ads_sync_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert sync logs"
  ON public.google_ads_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
